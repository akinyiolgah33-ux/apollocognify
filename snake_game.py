import pygame
import random
import sys

# Initialize pygame
pygame.init()

# Screen setup
WIDTH, HEIGHT = 800, 600
screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Neon Serpent Frenzy")

# Colors (neon palette)
NEON_COLORS = [
    (0, 255, 255),   # Electric blue
    (255, 0, 255),   # Hot pink
    (0, 255, 0),     # Lime green
    (255, 165, 0)    # Fiery orange
]

# Snake setup
snake_pos = [100, 50]
snake_body = [[100, 50], [90, 50], [80, 50]]
snake_direction = "RIGHT"
change_to = snake_direction

# Food setup
food_pos = [random.randrange(1, (WIDTH//10)) * 10,
            random.randrange(1, (HEIGHT//10)) * 10]
food_spawn = True

# Game variables
score = 0
speed = 15

# Fonts
font = pygame.font.SysFont("Arial", 24)

# Try to load sounds, fallback if missing
try:
    eat_sound = pygame.mixer.Sound("eat.wav")
    crash_sound = pygame.mixer.Sound("crash.wav")
except:
    eat_sound = None
    crash_sound = None

# Clock
clock = pygame.time.Clock()

def show_score():
    score_surface = font.render(f"Score: {score}", True, random.choice(NEON_COLORS))
    screen.blit(score_surface, (10, 10))

def game_over():
    if crash_sound:
        crash_sound.play()
    go_surface = font.render("GAME OVER", True, (255, 0, 0))
    screen.blit(go_surface, (WIDTH//2 - 80, HEIGHT//2))
    pygame.display.flip()
    pygame.time.wait(2000)
    pygame.quit()
    sys.exit()

# Main loop
while True:
    for event in pygame.event.get():
        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_UP: change_to = "UP"
            if event.key == pygame.K_DOWN: change_to = "DOWN"
            if event.key == pygame.K_LEFT: change_to = "LEFT"
            if event.key == pygame.K_RIGHT: change_to = "RIGHT"
        if event.type == pygame.QUIT:
            pygame.quit()
            sys.exit()

    # Validate direction
    if change_to == "UP" and not snake_direction == "DOWN":
        snake_direction = "UP"
    if change_to == "DOWN" and not snake_direction == "UP":
        snake_direction = "DOWN"
    if change_to == "LEFT" and not snake_direction == "RIGHT":
        snake_direction = "LEFT"
    if change_to == "RIGHT" and not snake_direction == "LEFT":
        snake_direction = "RIGHT"

    # Move snake
    if snake_direction == "UP":
        snake_pos[1] -= 10
    if snake_direction == "DOWN":
        snake_pos[1] += 10
    if snake_direction == "LEFT":
        snake_pos[0] -= 10
    if snake_direction == "RIGHT":
        snake_pos[0] += 10

    # Snake body growing
    snake_body.insert(0, list(snake_pos))
    if snake_pos[0] == food_pos[0] and snake_pos[1] == food_pos[1]:
        score += 10
        food_spawn = False
        if eat_sound:
            eat_sound.play()
    else:
        snake_body.pop()

    if not food_spawn:
        food_pos = [random.randrange(1, (WIDTH//10)) * 10,
                    random.randrange(1, (HEIGHT//10)) * 10]
    food_spawn = True

    screen.fill((0, 0, 0))
    for pos in snake_body:
        pygame.draw.rect(screen, (0, 255, 0), pygame.Rect(
            pos[0], pos[1], 10, 10))

    pygame.draw.rect(screen, (255, 0, 0), pygame.Rect(
        food_pos[0], food_pos[1], 10, 10))

    # Game Over conditions
    if snake_pos[0] < 0 or snake_pos[0] > WIDTH-10:
        game_over()
    if snake_pos[1] < 0 or snake_pos[1] > HEIGHT-10:
        game_over()
    
    for block in snake_body[1:]:
        if snake_pos[0] == block[0] and snake_pos[1] == block[1]:
            game_over()

    show_score()
    pygame.display.update()
    clock.tick(speed)
