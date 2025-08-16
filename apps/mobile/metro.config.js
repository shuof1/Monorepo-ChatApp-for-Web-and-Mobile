// apps/mobile/metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.unstable_enableSymlinks = true;
// 允许使用 package.json 的 "exports" 字段解析入口
config.resolver.unstable_enablePackageExports = true;
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 显式把两个包映射到根 node_modules（或直接指向 apps/mobile/node_modules，如果已就近安装）
config.resolver.extraNodeModules = {
  '@react-native-firebase/app': path.resolve(workspaceRoot, 'node_modules/@react-native-firebase/app'),
  '@react-native-firebase/firestore': path.resolve(workspaceRoot, 'node_modules/@react-native-firebase/firestore'),
};

module.exports = config;
