// apps/mobile/babel.config.js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      'babel-preset-expo', // Expo 必需
      // 如果你用 expo-router，可以再加:
      // 'expo-router/babel',
    ],
    plugins: [
      // 你项目里其它 babel 插件（如 module-resolver）
      // 必须在最后加:
      'react-native-reanimated/plugin'
    ],
  };
};