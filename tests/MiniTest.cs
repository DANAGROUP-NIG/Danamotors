using System;
using System.Collections.Generic;
using System.Reflection;

/// <summary>A tiny test runner (no NUnit: the build uses only the free compiler). Public static methods named Test* run.</summary>
public static class Check
{
    public static void True(bool condition, string what)
    {
        if (!condition) throw new Exception("Expected: " + what);
    }

    public static void Equal<T>(T expected, T actual, string what)
    {
        if (!EqualityComparer<T>.Default.Equals(expected, actual))
            throw new Exception(what + ": expected [" + expected + "] but was [" + actual + "]");
    }

    public static void Throws<TEx>(Action action, string what) where TEx : Exception
    {
        try { action(); }
        catch (TEx) { return; }
        throw new Exception(what + ": expected " + typeof(TEx).Name);
    }
}

public static class TestRunner
{
    public static int Main()
    {
        int passed = 0, failed = 0;
        foreach (Type t in Assembly.GetExecutingAssembly().GetTypes())
        {
            if (!t.Name.EndsWith("Tests")) continue;
            foreach (MethodInfo m in t.GetMethods(BindingFlags.Public | BindingFlags.Static))
            {
                if (!m.Name.StartsWith("Test")) continue;
                try { m.Invoke(null, null); passed++; }
                catch (TargetInvocationException e)
                {
                    failed++;
                    Console.WriteLine("FAIL " + t.Name + "." + m.Name + ": " + e.InnerException.Message);
                }
            }
        }
        Console.WriteLine(passed + " passed, " + failed + " failed");
        return failed == 0 ? 0 : 1;
    }
}
