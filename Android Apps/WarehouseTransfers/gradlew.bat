@ECHO OFF

SETLOCAL

SET APP_BASE_NAME=%~n0
SET APP_HOME=%~dp0

SET DEFAULT_JVM_OPTS=

SET CLASSPATH=%APP_HOME%\gradle\wrapper\gradle-wrapper.jar

IF EXIST "%JAVA_HOME%\bin\java.exe" (
  SET JAVACMD=%JAVA_HOME%\bin\java.exe
) ELSE (
  SET JAVACMD=java.exe
)

"%JAVACMD%" %DEFAULT_JVM_OPTS% %JAVA_OPTS% %GRADLE_OPTS% "-Dorg.gradle.appname=%APP_BASE_NAME%" -classpath "%CLASSPATH%" org.gradle.wrapper.GradleWrapperMain %*

ENDLOCAL
