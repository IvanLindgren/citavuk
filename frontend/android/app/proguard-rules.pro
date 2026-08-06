# Flutter plugins register through generated code. Add narrowly scoped keep
# rules here only when a release build or runtime test proves one is required.

# Credential Manager ищет провайдера Google по имени класса, через рефлексию:
# в коде ссылки на него нет, и R8 вырезает весь androidx.credentials.playservices.
# Наружу это выходит как «getCredentialAsync no provider dependencies found», а в
# приложении — как вход через Google, который молча «отменяется». Сломалось это в
# 1.12.0, когда включили isMinifyEnabled; правило взято из документации Android.
-if class androidx.credentials.CredentialManager
-keep class androidx.credentials.playservices.** {
  *;
}
