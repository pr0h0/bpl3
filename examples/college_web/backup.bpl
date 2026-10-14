import [SQLite] from "bpl-sqlite";
import printf from "std/c.bpl";
frame main(argc: int, argv: *string) ret int {
    if (argc != 3) {
        printf("Usage: college-backup SOURCE.sqlite NEW-SNAPSHOT.sqlite\n");
        return 2;
    }
    try {
        local db: SQLite = SQLite.openReadOnly(argv[1]);
        local owner: *SQLite = &db;
        defer owner.close();
        if (!db.integrityCheck()) {
            printf("Source database integrity check failed\n");
            return 1;
        }
        db.backupTo(argv[2], 30);
        local snapshot: SQLite = SQLite.openReadOnly(argv[2]);
        local snapshotOwner: *SQLite = &snapshot;
        defer snapshotOwner.close();
        if (!snapshot.integrityCheck()) {
            printf("Snapshot integrity check failed\n");
            return 1;
        }
        printf("Backup verified\n");
        return 0;
    } catch {
        printf("Backup failed; verify source, destination and permissions\n");
        return 1;
    }
}
