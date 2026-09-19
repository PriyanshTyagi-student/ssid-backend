export declare function initDatabase(): Promise<{
    db: any;
    client: any;
}>;
export declare function getDb(): any;
export declare function isDbConnected(): boolean;
export declare function closeDatabase(): Promise<void>;
