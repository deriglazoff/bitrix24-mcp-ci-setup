using System;
using System.Diagnostics;
using System.IO;
using System.Text;

internal static class Program
{
    private const string ServerFile = "server-http.js";

    private static int Main()
    {
        Console.OutputEncoding = Encoding.UTF8;
        try
        {
            Console.Title = "Bitrix24 MCP";
        }
        catch
        {
            // Title is optional when stdout is redirected.
        }

        string root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(
            Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

        LoadDotEnv(Path.Combine(root, ".env"));

        string node = FindOnPath("node");
        if (node == null)
        {
            Fail("Не найден Node.js в PATH. Установите Node.js 18 или новее: https://nodejs.org/");
            return 1;
        }

        string serverJs = Path.Combine(root, ServerFile);
        if (!File.Exists(serverJs))
        {
            Fail("Не найден server-http.js рядом с запускалкой. Положите Bitrix24-MCP.exe в корень репозитория.");
            return 1;
        }

        if (!Directory.Exists(Path.Combine(root, "node_modules")))
        {
            Console.Error.WriteLine("Зависимости не установлены — выполняю npm install...");
            int install = Run(FindNpm(), "install", root);
            if (install != 0)
            {
                Fail("npm install завершился с ошибкой. Проверьте сеть и package.json.");
                return install;
            }
        }

        Console.Error.WriteLine("Запускаю HTTP-шлюз Bitrix24 MCP...");
        int code = Run(node, Quote(serverJs), root);
        if (code != 0)
        {
            Fail("HTTP-шлюз завершился с кодом " + code + ".");
            return code;
        }
        return 0;
    }

    internal static void LoadDotEnv(string path)
    {
        if (!File.Exists(path)) return;
        foreach (string raw in File.ReadAllLines(path, Encoding.UTF8))
        {
            string line = raw.Trim();
            if (line.Length == 0 || line.StartsWith("#")) continue;
            int eq = line.IndexOf('=');
            if (eq <= 0) continue;
            string key = line.Substring(0, eq).Trim();
            string val = line.Substring(eq + 1).Trim();
            if (val.Length >= 2 && val[0] == '"' && val[val.Length - 1] == '"')
                val = val.Substring(1, val.Length - 2);
            if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable(key)))
                Environment.SetEnvironmentVariable(key, val);
        }
    }

    private static string FindNpm()
    {
        string npm = FindOnPath("npm.cmd") ?? FindOnPath("npm");
        if (npm == null)
        {
            Fail("Найден Node.js, но не найден npm. Переустановите Node.js с npm.");
            Environment.Exit(1);
        }
        return npm;
    }

    private static string FindOnPath(string name)
    {
        string path = Environment.GetEnvironmentVariable("PATH") ?? "";
        string pathext = Environment.GetEnvironmentVariable("PATHEXT") ?? ".EXE;.CMD;.BAT";
        string[] dirs = path.Split(new[] { Path.PathSeparator }, StringSplitOptions.RemoveEmptyEntries);
        string[] exts = pathext.Split(new[] { ';' }, StringSplitOptions.RemoveEmptyEntries);

        foreach (string dir in dirs)
        {
            string direct = Path.Combine(dir.Trim(), name);
            if (File.Exists(direct)) return direct;
            if (Path.HasExtension(name) == false)
            {
                foreach (string ext in exts)
                {
                    string candidate = Path.Combine(dir.Trim(), name + ext);
                    if (File.Exists(candidate)) return candidate;
                }
            }
        }
        return null;
    }

    private static int Run(string file, string arguments, string workDir)
    {
        var psi = new ProcessStartInfo
        {
            FileName = file,
            Arguments = arguments,
            WorkingDirectory = workDir,
            UseShellExecute = false
        };
        using (var p = Process.Start(psi))
        {
            if (p == null)
            {
                Fail("Не удалось запустить процесс: " + file);
                return 1;
            }
            p.WaitForExit();
            return p.ExitCode;
        }
    }

    private static string Quote(string path)
    {
        if (path.IndexOf(' ') < 0) return path;
        return "\"" + path + "\"";
    }

    private static void Fail(string message)
    {
        Console.Error.WriteLine(message);
        if (!Console.IsInputRedirected)
        {
            Console.Error.WriteLine("Нажмите клавишу, чтобы закрыть окно...");
            try { Console.ReadKey(true); } catch { }
        }
    }
}
