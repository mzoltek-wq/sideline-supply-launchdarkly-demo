# LaunchDarkly browser SDK

Unmodified browser bundle and source map from `launchdarkly-js-client-sdk@3.9.6`, obtained from the official npm package using `npm pack launchdarkly-js-client-sdk@3.9.6 --ignore-scripts`.

- Source: https://registry.npmjs.org/launchdarkly-js-client-sdk/-/launchdarkly-js-client-sdk-3.9.6.tgz
- Package SHA-512 integrity: `sha512-WiuAuRmD/YZGE6TYzt78lhObGAWioWEy39fYWjOVKJv4zupKAGwBXQb902Y3OD15XYf2J1kqyulN9G/AZgDJNw==`
- Original files: `dist/ldclient.min.js`, `dist/ldclient.min.js.map`, and `LICENSE.txt` (renamed to `LICENSE-launchdarkly.txt`).
- API reference: https://launchdarkly.github.io/js-client-sdk/interfaces/LDClient.html

Served with the application to avoid a runtime dependency on a third-party CDN. The browser bundle needs no build step. The Node backend still requires `npm ci` as documented in the root README. Keep the license with the SDK and use the matching 3.x API documentation when reading the integration.
