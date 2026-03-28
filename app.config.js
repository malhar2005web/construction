const appJson = require('./app.json');

const trimTrailingSlash = (value) => value.trim().replace(/\/+$/, '');

module.exports = () => {
  const configuredApiBaseUrl = process.env.EXPO_PUBLIC_API_URL
    ? trimTrailingSlash(process.env.EXPO_PUBLIC_API_URL)
    : '';

  return {
    ...appJson.expo,
    extra: {
      ...appJson.expo.extra,
      apiBaseUrl: configuredApiBaseUrl,
    },
  };
};
