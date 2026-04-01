# FlowDrop Release Hardening: ProGuard/R8 Rules

# 1. Protect the JNI Bridge
# We must keep the RustCore class and its static methods exactly as they are named, 
# because the native Rust code (lib.rs) calls them via the JNI "call_static_method" API.
-keep class com.flowdrop.core.RustCore {
    native <methods>;
    public static void writeChunkToBle(java.lang.String, byte[]);
    public static void onMessageReceived(java.lang.String, java.lang.String);
}

# 2. Prevent shrinking of the native library loading entry points
-keepclassmembers class com.flowdrop.core.RustCore {
    *** *;
}

# 3. Protect internal JNI data classes if they are being passed to/from Rust
# -keep class com.flowdrop.core.models.** { *; }

# 4. Standard JNI boiler-plate
-keepclasseswithmembernames class * {
    native <methods>;
}

# 5. Prevent R8 from obfuscating the package names required by JNI
-keeppackagenames com.flowdrop.core.**

# 6. Protect Hardware Bridge and Service Layer from obfuscation
# These classes are referenced via reflection or specific JNI name patterns
-keep class com.flowdrop.core.BluetoothScanner { *; }
-keep class com.flowdrop.core.FlowDropGattClient { *; }
-keep class com.flowdrop.core.FlowDropGattServer { *; }
-keep class com.flowdrop.core.MeshForegroundService { *; }
