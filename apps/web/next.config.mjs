/** @type {import('next').NextConfig} */
const nextConfig = {
    webpack: (config) => {
        // 1) 强制把 sqlite 适配器指向 loki（浏览器可用）
        config.resolve.alias = {
            ...(config.resolve.alias || {}),
            '@nozbe/watermelondb/adapters/sqlite':
                '@nozbe/watermelondb/adapters/lokijs',
            // 2) 避免意外引用到 node-only 包
            'better-sqlite3': false,
            fs: false,
            path: false,
        };

        config.experiments = {
            ...(config.experiments || {}),
            asyncWebAssembly: true,
        };
        return config;
    },

    transpilePackages: ["sync-engine", "adapter-firestore-web", "adapter-storage-wm", "@nozbe/watermelondb"],
};

export default nextConfig;
