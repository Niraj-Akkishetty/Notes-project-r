<?php
/**
 * Database connection and setup for Notes App
 * Uses SQLite3 — no external database server needed
 */

class Database {
    private static $instance = null;
    private $db;

    private function __construct() {
        $dbDir = __DIR__ . '/db';
        if (!is_dir($dbDir)) {
            mkdir($dbDir, 0777, true);
        }

        $dbPath = $dbDir . '/notes.db';
        $this->db = new SQLite3($dbPath);
        $this->db->exec('PRAGMA journal_mode = WAL');
        $this->db->exec('PRAGMA foreign_keys = ON');
        $this->createTables();
    }

    public static function getInstance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function getConnection() {
        return $this->db;
    }

    private function createTables() {
        $this->db->exec("
            CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT DEFAULT '',
                content TEXT DEFAULT '',
                color TEXT DEFAULT 'default',
                pinned INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ");
    }
}
