' 后台静默启动日报静态服务（放启动项用，不弹任何窗口）
' 服务把 docs\ 目录以只读方式暴露在 8000 端口，日志写 repo 根目录的 serve-report.log
Option Explicit

Dim fso, shell
Dim scriptDir, root, nodeExe, serverJs, logFile

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
root = fso.GetParentFolderName(scriptDir)
nodeExe = "C:\Users\asus\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
serverJs = root & "\tools\serve-report.mjs"
logFile = root & "\serve-report.log"

If Not fso.FileExists(serverJs) Then
  WScript.Quit 1
End If

shell.CurrentDirectory = root
If fso.FileExists(nodeExe) Then
  shell.Run """" & nodeExe & """ """ & serverJs & """", 0, False
Else
  shell.Run "node """ & serverJs & """", 0, False
End If
