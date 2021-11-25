export interface Manifest {
    manifest: {
        defaults: {
            remote: string;
        };
        remotes: {
            name: string;
            'url-base': string;
        }[];
        projects: {
            name: string;
            remote?: string;
            revision: string;
            path: string;
            'west-commands'?: string;
            groups?: string[];
        }[];
        'group-filter': string[];
        self?: {
            path: string;
            'west-commands'?: string;
            import?: string;
        };
    };
}
