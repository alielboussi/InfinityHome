/**
 * Metro bundle: defer heavy modules until used — faster cold start on slow phones.
 */
function applyMetroLightweightBundle(config) {
  const prior = config.transformer?.getTransformOptions;
  config.transformer = {
    ...config.transformer,
    getTransformOptions: async () => {
      const base = prior ? await prior() : {};
      return {
        ...base,
        transform: {
          ...(base.transform || {}),
          experimentalImportSupport: false,
          inlineRequires: true,
        },
      };
    },
  };
  return config;
}

module.exports = { applyMetroLightweightBundle };
