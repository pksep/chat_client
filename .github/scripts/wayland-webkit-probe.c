#include <gtk/gtk.h>
#include <webkit2/webkit2.h>

static gboolean loaded = FALSE;

static void load_changed(WebKitWebView *view, WebKitLoadEvent event, gpointer data) {
  if (event == WEBKIT_LOAD_FINISHED) {
    loaded = TRUE;
    g_print("Wayland WebKit: HTML загружен\n");
  }
}

static gboolean finish(gpointer data) {
  gtk_main_quit();
  return G_SOURCE_REMOVE;
}

int main(int argc, char **argv) {
  gtk_init(&argc, &argv);
  GtkWidget *window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
  gtk_window_set_default_size(GTK_WINDOW(window), 600, 400);
  gtk_window_set_decorated(GTK_WINDOW(window), FALSE);
  GtkWidget *view = webkit_web_view_new();
  gtk_container_add(GTK_CONTAINER(window), view);
  g_signal_connect(view, "load-changed", G_CALLBACK(load_changed), NULL);
  gtk_widget_show_all(window);
  webkit_web_view_load_html(WEBKIT_WEB_VIEW(view), "<!doctype html><title>Проверка WebKit</title><p>Синтетические данные</p>", NULL);
  g_timeout_add_seconds(5, finish, NULL);
  gtk_main();
  g_print("Wayland WebKit: проверка завершена, loaded=%d\n", loaded);
  return loaded ? 0 : 1;
}
