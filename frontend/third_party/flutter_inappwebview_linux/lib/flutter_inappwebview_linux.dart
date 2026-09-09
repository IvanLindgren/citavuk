/// Linux использует отдельный GTK-плеер в LinuxVideoPlayer, не InAppWebView.
/// Не регистрируем WPE-бэкенд: он требует системные API новее Ubuntu 22.04.
class CitavukLinuxPlayerSelection {
  static void registerWith() {}
}
