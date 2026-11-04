Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
If sh.Run("cmd /c where node", 0, True) <> 0 Then
  MsgBox "Node.js не найден. Открываю офлайн-версию игры." & vbCrLf & "Для рекордов и гонок в базе установи Node.js LTS с nodejs.org", 64, "Платок и Борода"
  sh.Run """" & dir & "\client\index.html""", 1, False
ElseIf fso.FolderExists(dir & "\server\node_modules\@nestjs\swagger") Then
  sh.Run "cmd /c """ & dir & "\app.bat""", 0, False
Else
  sh.Run "cmd /c """ & dir & "\start.bat""", 1, False
End If
