<?php
// CORS headers for local development testing
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Content-Type: application/json");

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Disable error reporting output in JSON responses
error_reporting(0);
ini_set('display_errors', 0);

// Resolve SQLite Database
$dbPath = __DIR__ . '/cognify.db';
try {
    $db = new PDO("sqlite:" . $dbPath);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
} catch (Exception $e) {
    echo json_encode(["error" => "Database connection failed: " . $e->getMessage()]);
    exit;
}

// Database Initialization
$db->exec("CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT,
    email TEXT,
    password_hash TEXT
)");

$db->exec("CREATE TABLE IF NOT EXISTS login_events (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    email TEXT,
    login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_agent TEXT,
    ip_address TEXT,
    FOREIGN KEY (user_id) REFERENCES users (id)
)");

$db->exec("CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    title TEXT,
    content TEXT,
    tags TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
)");

$db->exec("CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    title TEXT,
    description TEXT,
    date TEXT,
    type TEXT DEFAULT 'study',
    linked_note_id TEXT,
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (linked_note_id) REFERENCES notes (id)
)");

$db->exec("CREATE TABLE IF NOT EXISTS flashcards (
    id TEXT PRIMARY KEY,
    note_id TEXT,
    user_id TEXT,
    question TEXT,
    answer TEXT,
    review_date TEXT,
    FOREIGN KEY (note_id) REFERENCES notes (id),
    FOREIGN KEY (user_id) REFERENCES users (id)
)");

$db->exec("CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    message TEXT,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
)");

// Safe columns migrations
try {
    $db->exec("ALTER TABLE events ADD COLUMN type TEXT DEFAULT 'study'");
} catch (Exception $e) {}
try {
    $db->exec("ALTER TABLE flashcards ADD COLUMN user_id TEXT");
} catch (Exception $e) {}

// Utility function to generate UUID v4
function uuidv4() {
    $data = random_bytes(16);
    $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
    $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

// Retrieve PATH_INFO routing
$pathInfo = $_SERVER['PATH_INFO'] ?? '';
$pathInfo = trim($pathInfo, '/');
$method = $_SERVER['REQUEST_METHOD'];

// Middleware: Authenticate Token
$userId = null;
$headers = getallheaders();
$authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
if (preg_match('/Bearer mock\.(.*?)\.signature/', $authHeader, $matches)) {
    $payload = json_decode(base64_decode($matches[1]), true);
    $userId = $payload['user_id'] ?? null;
}

// Function to enforce authentication
function requireAuth($userId) {
    if (!$userId) {
        http_response_code(401);
        echo json_encode(["error" => "Unauthorized access. Token required."]);
        exit;
    }
}

// Route Handling
$routes = explode('/', $pathInfo);
$primaryRoute = $routes[0] ?? '';

// POST /api.php/users/register
if ($primaryRoute === 'users' && ($routes[1] ?? '') === 'register' && $method === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true);
    $email = $body['email'] ?? $body['username'] ?? '';
    $password = $body['password'] ?? '';
    
    if (!$email || !$password) {
        http_response_code(400);
        echo json_encode(["error" => "Email and password required"]);
        exit;
    }
    
    $id = uuidv4();
    $username = explode('@', $email)[0];
    
    try {
        $stmt = $db->prepare("INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)");
        $stmt->execute([$id, $username, $email, password_hash($password, PASSWORD_DEFAULT)]);
        
        $notifId = uuidv4();
        $stmtNotif = $db->prepare("INSERT INTO notifications (id, user_id, message) VALUES (?, ?, ?)");
        $stmtNotif->execute([$notifId, $id, 'Welcome to Cognify! Your account has been created.']);
        
        $mockToken = base64_encode(json_encode(["user_id" => $id]));
        echo json_encode([
            "success" => true,
            "token" => "mock." . $mockToken . ".signature",
            "user" => ["uid" => $id, "email" => $email]
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(["error" => $e->getMessage()]);
    }
    exit;
}

// POST /api.php/users/login
if ($primaryRoute === 'users' && ($routes[1] ?? '') === 'login' && $method === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true);
    $email = $body['email'] ?? $body['username'] ?? '';
    
    try {
        $stmt = $db->prepare("SELECT id FROM users WHERE email = ? LIMIT 1");
        $stmt->execute([$email]);
        $user = $stmt->fetch();
        
        if (!$user) {
            http_response_code(401);
            echo json_encode(["error" => "User not found"]);
            exit;
        }
        
        $uid = $user['id'];
        $loginId = uuidv4();
        $stmtLogin = $db->prepare("INSERT INTO login_events (id, user_id, email, user_agent, ip_address) VALUES (?, ?, ?, ?, ?)");
        $stmtLogin->execute([$loginId, $uid, $email, $_SERVER['HTTP_USER_AGENT'] ?? '', $_SERVER['REMOTE_ADDR'] ?? '']);
        
        $mockToken = base64_encode(json_encode(["user_id" => $uid]));
        echo json_encode([
            "success" => true,
            "token" => "mock." . $mockToken . ".signature",
            "user" => ["uid" => $uid, "email" => $email]
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(["error" => $e->getMessage()]);
    }
    exit;
}

// Check authorization for all subsequent endpoints
requireAuth($userId);

// ---- NOTES ROUTE ----
if ($primaryRoute === 'notes') {
    if ($method === 'GET') {
        $stmt = $db->prepare("SELECT * FROM notes WHERE user_id = ? ORDER BY created_at DESC");
        $stmt->execute([$userId]);
        echo json_encode(["success" => true, "notes" => $stmt->fetchAll()]);
    } elseif ($method === 'POST') {
        $body = json_decode(file_get_contents('php://input'), true);
        $content = $body['content'] ?? '';
        if (!$content) {
            http_response_code(400);
            echo json_encode(["error" => "Content required."]);
            exit;
        }
        $id = uuidv4();
        $title = $body['title'] ?? 'Untitled';
        $tags = $body['tags'] ?? '';
        
        $stmt = $db->prepare("INSERT INTO notes (id, user_id, title, content, tags) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$id, $userId, $title, $content, $tags]);
        echo json_encode([
            "success" => true,
            "note" => ["id" => $id, "user_id" => $userId, "title" => $title, "content" => $content, "tags" => $tags]
        ]);
    } elseif ($method === 'PUT') {
        $noteId = $routes[1] ?? '';
        $body = json_decode(file_get_contents('php://input'), true);
        $title = $body['title'] ?? '';
        $content = $body['content'] ?? '';
        $tags = $body['tags'] ?? '';
        
        $stmt = $db->prepare("UPDATE notes SET title=?, content=?, tags=? WHERE id=? AND user_id=?");
        $stmt->execute([$title, $content, $tags, $noteId, $userId]);
        echo json_encode(["success" => true, "changes" => $stmt->rowCount()]);
    } elseif ($method === 'DELETE') {
        $noteId = $routes[1] ?? '';
        $stmt = $db->prepare("DELETE FROM notes WHERE id=? AND user_id=?");
        $stmt->execute([$noteId, $userId]);
        echo json_encode(["success" => true]);
    }
    exit;
}

// ---- EVENTS ROUTE ----
if ($primaryRoute === 'events') {
    if ($method === 'GET') {
        $stmt = $db->prepare("SELECT * FROM events WHERE user_id = ? ORDER BY date ASC");
        $stmt->execute([$userId]);
        echo json_encode(["success" => true, "events" => $stmt->fetchAll()]);
    } elseif ($method === 'POST') {
        $body = json_decode(file_get_contents('php://input'), true);
        $title = $body['title'] ?? '';
        $date = $body['date'] ?? '';
        if (!$title || !$date) {
            http_response_code(400);
            echo json_encode(["error" => "Title and date required."]);
            exit;
        }
        $id = uuidv4();
        $description = $body['description'] ?? '';
        $type = $body['type'] ?? 'study';
        $linked = $body['linked_note_id'] ?? null;
        
        $stmt = $db->prepare("INSERT INTO events (id, user_id, title, description, date, type, linked_note_id) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([$id, $userId, $title, $description, $date, $type, $linked]);
        echo json_encode([
            "success" => true,
            "event" => ["id" => $id, "title" => $title, "description" => $description, "date" => $date, "type" => $type]
        ]);
    } elseif ($method === 'DELETE') {
        $eventId = $routes[1] ?? '';
        $stmt = $db->prepare("DELETE FROM events WHERE id=? AND user_id=?");
        $stmt->execute([$eventId, $userId]);
        echo json_encode(["success" => true]);
    }
    exit;
}

// ---- FLASHCARDS ROUTE ----
if ($primaryRoute === 'flashcards') {
    if (($routes[1] ?? '') === 'review' && $method === 'GET') {
        $today = date('Y-m-d');
        $stmt = $db->prepare("
            SELECT f.* FROM flashcards f
            LEFT JOIN notes n ON f.note_id = n.id
            WHERE (f.user_id = ? OR n.user_id = ?) AND f.review_date <= ?
            ORDER BY f.review_date ASC LIMIT 20
        ");
        $stmt->execute([$userId, $userId, $today]);
        echo json_encode(["success" => true, "due_flashcards" => $stmt->fetchAll()]);
        exit;
    }
    
    if ($method === 'PUT') {
        $fcId = $routes[1] ?? '';
        $body = json_decode(file_get_contents('php://input'), true);
        $reviewDate = $body['review_date'] ?? '';
        
        if (!$reviewDate) {
            http_response_code(400);
            echo json_encode(["error" => "review_date is required."]);
            exit;
        }
        
        // Verify ownership
        $stmtCheck = $db->prepare("
            SELECT f.id FROM flashcards f
            LEFT JOIN notes n ON f.note_id = n.id
            WHERE f.id = ? AND (f.user_id = ? OR n.user_id = ?)
        ");
        $stmtCheck->execute([$fcId, $userId, $userId]);
        $row = $stmtCheck->fetch();
        
        if (!$row) {
            http_response_code(403);
            echo json_encode(["error" => "Unauthorized to update this flashcard"]);
            exit;
        }
        
        $stmt = $db->prepare("UPDATE flashcards SET review_date = ? WHERE id = ?");
        $stmt->execute([$reviewDate, $fcId]);
        echo json_encode(["success" => true, "changes" => $stmt->rowCount()]);
        exit;
    }
}

// ---- NOTIFICATIONS ROUTE ----
if ($primaryRoute === 'notifications') {
    if ($method === 'GET') {
        $stmt = $db->prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC");
        $stmt->execute([$userId]);
        echo json_encode(["success" => true, "notifications" => $stmt->fetchAll()]);
    } elseif (($routes[2] ?? '') === 'read' && $method === 'PUT') {
        $notifId = $routes[1] ?? '';
        $stmt = $db->prepare("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?");
        $stmt->execute([$notifId, $userId]);
        echo json_encode(["success" => true]);
    }
    exit;
}

// ---- AI ROUTE (PHP Fallbacks) ----
if ($primaryRoute === 'ai') {
    $aiAction = $routes[1] ?? '';
    
    if ($aiAction === 'summarize' && $method === 'POST') {
        $body = json_decode(file_get_contents('php://input'), true);
        $text = $body['text'] ?? '';
        
        // Split sentences by . or ! or ?
        $sentences = preg_split('/(?<=[.!?])\s+/', trim($text));
        $summarySentences = array_slice($sentences, 0, 3);
        $summary = implode(' ', $summarySentences);
        
        echo json_encode(["success" => true, "summary" => $summary]);
        exit;
    }
    
    if ($aiAction === 'extract-entities' && $method === 'POST') {
        $body = json_decode(file_get_contents('php://input'), true);
        $text = $body['text'] ?? '';
        
        // Find words starting with Capital letters
        preg_match_all('/\b[A-Z][a-z]+\b/', $text, $matches);
        $words = array_unique($matches[0]);
        
        $entities = [];
        foreach ($words as $w) {
            $entities[] = ["text" => $w, "label" => "ENTITY"];
        }
        
        echo json_encode(["success" => true, "entities" => $entities]);
        exit;
    }
    
    if ($aiAction === 'extract-flashcards' && $method === 'POST') {
        $body = json_decode(file_get_contents('php://input'), true);
        $text = $body['text'] ?? '';
        
        $sentences = preg_split('/(?<=[.!?])\s+/', trim($text));
        $cards = [];
        $today = date('Y-m-d');
        
        foreach ($sentences as $sentence) {
            if (strlen($sentence) < 10) continue;
            // Simple noun extractor: find words longer than 5 chars
            $words = str_word_count($sentence, 1);
            $nouns = array_filter($words, function($w) { return strlen($w) > 5; });
            
            if (count($nouns) > 0) {
                // sort by length desc
                usort($nouns, function($a, $b) { return strlen($b) - strlen($a); });
                $target = $nouns[0];
                
                $cards[] = [
                    "id" => uuidv4(),
                    "note_id" => null,
                    "question" => str_replace($target, '______', $sentence),
                    "answer" => $target,
                    "review_date" => $today
                ];
            }
        }
        
        $cards = array_slice($cards, 0, 10);
        
        $stmt = $db->prepare("INSERT OR IGNORE INTO flashcards (id, note_id, user_id, question, answer, review_date) VALUES (?, ?, ?, ?, ?, ?)");
        foreach ($cards as $c) {
            $stmt->execute([$c['id'], $c['note_id'], $userId, $c['question'], $c['answer'], $c['review_date']]);
        }
        
        echo json_encode(["success" => true, "flashcards" => $cards]);
        exit;
    }
}

// Route not found fallback
http_response_code(404);
echo json_encode(["error" => "Route not found ($pathInfo)"]);
