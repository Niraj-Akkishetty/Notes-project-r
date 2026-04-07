<?php
/**
 * REST API for Notes App
 * Handles GET, POST, PUT, DELETE requests
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/db.php';

$db = Database::getInstance()->getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$action = isset($_GET['action']) ? $_GET['action'] : '';

try {
    switch ($method) {
        case 'GET':
            handleGet($db, $action);
            break;
        case 'POST':
            handlePost($db, $action);
            break;
        case 'PUT':
            handlePut($db, $action);
            break;
        case 'DELETE':
            handleDelete($db, $action);
            break;
        default:
            respond(405, ['error' => 'Method not allowed']);
    }
} catch (Exception $e) {
    respond(500, ['error' => 'Server error: ' . $e->getMessage()]);
}

/* ── GET: List all notes ─────────────────────────────── */
function handleGet($db, $action) {
    $search = isset($_GET['search']) ? $_GET['search'] : '';

    $query = "SELECT * FROM notes";
    if ($search !== '') {
        $query .= " WHERE title LIKE :search OR content LIKE :search";
    }
    $query .= " ORDER BY pinned DESC, updated_at DESC";

    $stmt = $db->prepare($query);
    if ($search !== '') {
        $stmt->bindValue(':search', '%' . $search . '%', SQLITE3_TEXT);
    }

    $result = $stmt->execute();
    $notes = [];
    while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
        $row['pinned'] = (bool)$row['pinned'];
        $notes[] = $row;
    }

    respond(200, $notes);
}

/* ── POST: Create a new note ─────────────────────────── */
function handlePost($db, $action) {
    $input = json_decode(file_get_contents('php://input'), true);

    if (!$input) {
        respond(400, ['error' => 'Invalid JSON input']);
        return;
    }

    $title   = isset($input['title'])   ? trim($input['title'])   : '';
    $content = isset($input['content']) ? trim($input['content']) : '';
    $color   = isset($input['color'])   ? trim($input['color'])   : 'default';

    if ($title === '' && $content === '') {
        respond(400, ['error' => 'Note must have a title or content']);
        return;
    }

    $stmt = $db->prepare("
        INSERT INTO notes (title, content, color, created_at, updated_at)
        VALUES (:title, :content, :color, datetime('now'), datetime('now'))
    ");
    $stmt->bindValue(':title',   $title,   SQLITE3_TEXT);
    $stmt->bindValue(':content', $content, SQLITE3_TEXT);
    $stmt->bindValue(':color',   $color,   SQLITE3_TEXT);
    $stmt->execute();

    $id = $db->lastInsertRowID();

    // Fetch and return the created note
    $stmt = $db->prepare("SELECT * FROM notes WHERE id = :id");
    $stmt->bindValue(':id', $id, SQLITE3_INTEGER);
    $result = $stmt->execute();
    $note = $result->fetchArray(SQLITE3_ASSOC);
    $note['pinned'] = (bool)$note['pinned'];

    respond(201, $note);
}

/* ── PUT: Update an existing note ────────────────────── */
function handlePut($db, $action) {
    $input = json_decode(file_get_contents('php://input'), true);

    if (!$input || !isset($input['id'])) {
        respond(400, ['error' => 'Invalid input — id required']);
        return;
    }

    $id = (int)$input['id'];

    // Toggle pin action
    if ($action === 'toggle-pin') {
        $stmt = $db->prepare("UPDATE notes SET pinned = NOT pinned, updated_at = datetime('now') WHERE id = :id");
        $stmt->bindValue(':id', $id, SQLITE3_INTEGER);
        $stmt->execute();
    } else {
        // Full update
        $title   = isset($input['title'])   ? trim($input['title'])   : '';
        $content = isset($input['content']) ? trim($input['content']) : '';
        $color   = isset($input['color'])   ? trim($input['color'])   : 'default';

        $stmt = $db->prepare("
            UPDATE notes SET title = :title, content = :content, color = :color, updated_at = datetime('now')
            WHERE id = :id
        ");
        $stmt->bindValue(':id',      $id,      SQLITE3_INTEGER);
        $stmt->bindValue(':title',   $title,   SQLITE3_TEXT);
        $stmt->bindValue(':content', $content, SQLITE3_TEXT);
        $stmt->bindValue(':color',   $color,   SQLITE3_TEXT);
        $stmt->execute();
    }

    // Return updated note
    $stmt = $db->prepare("SELECT * FROM notes WHERE id = :id");
    $stmt->bindValue(':id', $id, SQLITE3_INTEGER);
    $result = $stmt->execute();
    $note = $result->fetchArray(SQLITE3_ASSOC);

    if (!$note) {
        respond(404, ['error' => 'Note not found']);
        return;
    }

    $note['pinned'] = (bool)$note['pinned'];
    respond(200, $note);
}

/* ── DELETE: Remove a note ───────────────────────────── */
function handleDelete($db, $action) {
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;

    if ($id <= 0) {
        respond(400, ['error' => 'Valid note id required']);
        return;
    }

    $stmt = $db->prepare("DELETE FROM notes WHERE id = :id");
    $stmt->bindValue(':id', $id, SQLITE3_INTEGER);
    $stmt->execute();

    if ($db->changes() > 0) {
        respond(200, ['message' => 'Note deleted', 'id' => $id]);
    } else {
        respond(404, ['error' => 'Note not found']);
    }
}

/* ── Response helper ─────────────────────────────────── */
function respond($code, $data) {
    http_response_code($code);
    echo json_encode($data);
    exit();
}
