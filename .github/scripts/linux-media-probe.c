#include <gst/gst.h>
#include <stdio.h>

int main(int argc, char **argv) {
  GError *error = NULL;
  if (argc != 2 || !gst_init_check(NULL, NULL, &error)) {
    fprintf(stderr, "GStreamer initialization failed: %s\n", error ? error->message : "plugin directory missing");
    g_clear_error(&error);
    return 1;
  }
  guint major, minor, micro, nano;
  gst_version(&major, &minor, &micro, &nano);
  printf("GStreamer %u.%u.%u\n", major, minor, micro);
  const char *required[] = {"autoaudiosink", "pulsesink", "opusdec", "vp8dec", "videoconvert", "decodebin", "webrtcbin", "nicesrc"};
  int failed = 0;
  for (guint i = 0; i < G_N_ELEMENTS(required); i++) {
    GstElementFactory *factory = gst_element_factory_find(required[i]);
    GstPluginFeature *loaded = factory ? gst_plugin_feature_load(GST_PLUGIN_FEATURE(factory)) : NULL;
    GstPlugin *plugin = loaded ? gst_plugin_feature_get_plugin(loaded) : NULL;
    const char *filename = plugin ? gst_plugin_get_filename(plugin) : NULL;
    if (!filename || !g_str_has_prefix(filename, argv[1])) {
      fprintf(stderr, "Missing bundled plugin: %s (%s)\n", required[i], filename ? filename : "not loaded");
      failed = 1;
    } else {
      printf("%s: %s\n", required[i], filename);
    }
    if (plugin) gst_object_unref(plugin);
    if (loaded) gst_object_unref(loaded);
    if (factory) gst_object_unref(factory);
  }
  gst_deinit();
  return failed;
}
