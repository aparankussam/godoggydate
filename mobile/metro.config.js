const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

/**
 * Allow Metro to resolve modules from the monorepo root.
 * This is required for imports like '../../shared/profile' to resolve
 * correctly when Metro is rooted at mobile/.
 */
config.watchFolders = [monorepoRoot];

/**
 * Add both project-level and root-level node_modules to the resolver
 * so shared packages can be found from either location.
 */
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

module.exports = config;
