' 快递情报日报：重建网页并打开（双击桌面快捷方式时运行）
' 用法：
'   wscript show-report.vbs            静默重建 docs\index.html 并用浏览器打开
'   cscript show-report.vbs //nologo --print   只输出各路径（用于排查）
Option Explicit

Dim fso, shell
Dim scriptDir, root, nodeExe, md2html, htmlFile, logFile
Dim printMode, rc

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
root = fso.GetParentFolderName(scriptDir)
nodeExe = "C:\Users\asus\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
md2html = root & "\tools\md2html.mjs"
htmlFile = root & "\docs\index.html"
logFile = root & "\show-report.log"

printMode = False
If WScript.Arguments.Count > 0 Then
  If LCase(WScript.Arguments(0)) = "--print" Then printMode = True
End If

If printMode Then
  WScript.Echo "root    = " & root
  WScript.Echo "node    = " & nodeExe & " (" & CStr(fso.FileExists(nodeExe)) & ")"
  WScript.Echo "md2html = " & md2html & " (" & CStr(fso.FileExists(md2html)) & ")"
  WScript.Echo "html    = " & htmlFile & " (" & CStr(fso.FileExists(htmlFile)) & ")"
  WScript.Quit 0
End If

' 1) 重建页面（隐藏窗口，等待完成）
shell.CurrentDirectory = root
If fso.FileExists(nodeExe) Then
  rc = shell.Run("""" & nodeExe & """ """ & md2html & """ --latest", 0, True)
Else
  rc = shell.Run("node """ & md2html & """ --latest", 0, True)
End If

If rc <> 0 Then
  LogLine logFile, "rebuild failed, rc=" & rc
End If

' 2) 打开页面：先按系统默认程序，再用 Edge，最后退到资源管理器
If fso.FileExists(htmlFile) Then
  On Error Resume Next
  shell.Run """" & htmlFile & """", 1, False
  If Err.Number <> 0 Then
    Err.Clear
    shell.Run """C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"" ""file:///" & Replace(htmlFile, "\", "/") & """", 1, False
    If Err.Number <> 0 Then
      Err.Clear
      shell.Run "explorer.exe /select,""" & htmlFile & """", 1, False
    End If
  End If
  On Error GoTo 0
Else
  LogLine logFile, "html not found: " & htmlFile
  shell.Run "explorer.exe """ & root & "\docs""", 1, False
End If

Sub LogLine(path, msg)
  On Error Resume Next
  Dim f
  Set f = fso.OpenTextFile(path, 8, True)
  f.WriteLine Now & "  " & msg
  f.Close
  On Error GoTo 0
End Sub
