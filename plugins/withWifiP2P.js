const { withProjectBuildGradle, withAndroidManifest } = require('@expo/config-plugins');

/**
 * Enhanced Expo Config Plugin for FlowDrop
 * Aggressively forces Kotlin 1.9.25 across all Android modules.
 */
module.exports = (config) => {
  // 1. Aggressive Kotlin Version Override
  config = withProjectBuildGradle(config, (config) => {
    let contents = config.modResults.contents;

    // Force the root ext.kotlinVersion
    if (contents.includes('kotlinVersion =')) {
        contents = contents.replace(
            /kotlinVersion\s*=\s*['"].*?['"]/g,
            "kotlinVersion = '1.9.25'"
        );
    } else {
        // If not found, inject it into the ext block
        contents = contents.replace(
            /ext\s*{/,
            "ext {\n        kotlinVersion = '1.9.25'"
        );
    }

    // Force EVERY sub-project to use this version
    // This is the "Nuclear" option for overriding module-specific defaults
    const forceKotlinSnippet = `
allprojects {
    configurations.all {
        resolutionStrategy.eachDependency { DependencyResolveDetails details ->
            if (details.requested.group == 'org.jetbrains.kotlin') {
                details.useVersion '1.9.25'
            }
        }
    }
}
`;
    if (!contents.includes('resolutionStrategy.eachDependency')) {
        contents += forceKotlinSnippet;
    }

    config.modResults.contents = contents;
    return config;
  });

  // 2. Add Android Permissions for Wi-Fi P2P & Bluetooth
  config = withAndroidManifest(config, (config) => {
    const permissions = [
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_WIFI_STATE',
      'android.permission.CHANGE_WIFI_STATE',
      'android.permission.INTERNET',
      'android.permission.NEARBY_WIFI_DEVICES',
      'android.permission.BLUETOOTH',
      'android.permission.BLUETOOTH_ADMIN',
      'android.permission.BLUETOOTH_SCAN',
      'android.permission.BLUETOOTH_CONNECT',
      'android.permission.BLUETOOTH_ADVERTISE'
    ];

    if (!config.modResults.manifest['uses-permission']) {
      config.modResults.manifest['uses-permission'] = [];
    }

    permissions.forEach(perm => {
      if (!config.modResults.manifest['uses-permission'].find(p => p.$['android:name'] === perm)) {
        config.modResults.manifest['uses-permission'].push({
          $: { 'android:name': perm }
        });
      }
    });

    return config;
  });

  return config;
};
