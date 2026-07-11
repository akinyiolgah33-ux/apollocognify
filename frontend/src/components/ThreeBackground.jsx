import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export default function ThreeBackground() {
  const glCanvasRef = useRef(null);
  const canvas2DRef = useRef(null);
  const containerRef = useRef(null);
  const [activeTheme, setActiveTheme] = useState('dark-teal');

  // React to theme changes using a MutationObserver on documentElement's data-theme
  useEffect(() => {
    const checkTheme = () => {
      const theme = document.documentElement.getAttribute('data-theme') || 'dark-teal';
      setActiveTheme(theme);
    };

    checkTheme();

    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => observer.disconnect();
  }, []);

  // ─── THREE.JS ICOSAHEDRON ANIMATION (Classic Themes) ───────────────────────
  useEffect(() => {
    const isClassic = ['dark-teal', 'dark-purple', 'dark-blue', 'dark-amber'].includes(activeTheme);
    if (!isClassic || !glCanvasRef.current) return;

    const canvas = glCanvasRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    camera.position.z = 5;

    // Get color based on active theme
    const themeColors = {
      'dark-teal': 0x2dd4bf,
      'dark-purple': 0xa78bfa,
      'dark-blue': 0x60a5fa,
      'dark-amber': 0xfbbf24
    };
    const meshColor = themeColors[activeTheme] || 0x2dd4bf;

    const geometry = new THREE.IcosahedronGeometry(2, 1);
    const material = new THREE.MeshBasicMaterial({ 
      color: meshColor, 
      wireframe: true,
      transparent: true,
      opacity: 0.15
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    let animationFrameId;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      mesh.rotation.x += 0.001;
      mesh.rotation.y += 0.002;
      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, [activeTheme]);

  // ─── 2D CANVAS INTERACTIVE WALLPAPERS (Live Themes) ────────────────────────
  useEffect(() => {
    const isLive = ['cyber-corridor', 'glowing-hexagons', 'synthwave-landscape', 'dark-live', 'light-live'].includes(activeTheme);
    if (!isLive || !canvas2DRef.current) return;

    const canvas = canvas2DRef.current;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Mouse coordinates tracker
    let mouse = { x: width / 2, y: height / 2, targetX: width / 2, targetY: height / 2 };
    
    const handleMouseMove = (e) => {
      mouse.targetX = e.clientX;
      mouse.targetY = e.clientY;
    };
    window.addEventListener('mousemove', handleMouseMove);

    // Smooth cursor movement interpolation
    const updateMouse = () => {
      mouse.x += (mouse.targetX - mouse.x) * 0.08;
      mouse.y += (mouse.targetY - mouse.y) * 0.08;
    };

    // --- CYBER CORRIDOR STREAKS STATE ---
    const corridorStreaks = [];
    const maxStreaks = 45;
    const initCorridorStreaks = () => {
      corridorStreaks.length = 0;
      for (let i = 0; i < maxStreaks; i++) {
        corridorStreaks.push({
          angle: Math.random() * Math.PI * 2,
          distance: Math.random(),
          speed: 0.004 + Math.random() * 0.012,
          length: 30 + Math.random() * 80,
          color: Math.random() > 0.4 ? '#00f0ff' : '#ff007f',
          width: 0.8 + Math.random() * 1.8,
        });
      }
    };

    // --- GLOWING HEXAGONS STATE ---
    const ambientBlobs = [];
    const circuitPackets = [];
    const initHexagons = () => {
      ambientBlobs.length = 0;
      circuitPackets.length = 0;

      // Soft breathing blobs
      for (let i = 0; i < 4; i++) {
        ambientBlobs.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5,
          radius: 180 + Math.random() * 150,
          color: i % 2 === 0 ? 'rgba(251, 146, 60, 0.07)' : 'rgba(56, 189, 248, 0.07)'
        });
      }

      // Moving nodes
      for (let i = 0; i < 20; i++) {
        circuitPackets.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.7,
          vy: (Math.random() - 0.5) * 0.7,
          radius: 1.5 + Math.random() * 2,
          color: Math.random() > 0.5 ? '#fb923c' : '#38bdf8',
          history: []
        });
      }
    };

    // --- SYNTHWAVE LANDSCAPE STATE ---
    const stars = [];
    const initSynthwave = () => {
      stars.length = 0;
      for (let i = 0; i < 90; i++) {
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height * 0.62,
          size: 0.5 + Math.random() * 1.2,
          opacity: Math.random(),
          speed: 0.01 + Math.random() * 0.02
        });
      }
    };

    let gridOffset = 0;

    // Initialize wallpaper-specific coordinates
    if (activeTheme === 'cyber-corridor') initCorridorStreaks();
    else if (activeTheme === 'glowing-hexagons' || activeTheme === 'dark-live' || activeTheme === 'light-live') initHexagons();
    else if (activeTheme === 'synthwave-landscape') initSynthwave();

    // Render loop
    const render = () => {
      ctx.clearRect(0, 0, width, height);
      updateMouse();

      if (activeTheme === 'cyber-corridor') {
        // Vanishing point shift with parallax
        const centerX = width / 2 + (mouse.x - width / 2) * 0.07;
        const centerY = height / 2 + (mouse.y - height / 2) * 0.07;
        const maxRadius = Math.sqrt(width * width + height * height) / 1.8;

        for (let s of corridorStreaks) {
          s.distance += s.speed;
          if (s.distance > 1) {
            s.distance = 0;
            s.angle = Math.random() * Math.PI * 2;
            s.color = Math.random() > 0.4 ? '#00f0ff' : '#ff007f';
          }

          const rStart = s.distance * maxRadius;
          const rEnd = Math.max(0, s.distance * maxRadius - s.length);

          const startX = centerX + Math.cos(s.angle) * rStart;
          const startY = centerY + Math.sin(s.angle) * rStart;
          const endX = centerX + Math.cos(s.angle) * rEnd;
          const endY = centerY + Math.sin(s.angle) * rEnd;

          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(endX, endY);
          ctx.strokeStyle = s.color;
          ctx.lineWidth = s.width * s.distance * 2.2;
          ctx.globalAlpha = Math.min(1, s.distance * 1.6);
          ctx.stroke();
        }
        ctx.globalAlpha = 1.0;

        // Center portal glow
        const glowGrad = ctx.createRadialGradient(centerX, centerY, 1, centerX, centerY, 130);
        glowGrad.addColorStop(0, 'rgba(0, 240, 255, 0.16)');
        glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 130, 0, Math.PI * 2);
        ctx.globalAlpha = 1.0;

      } else if (activeTheme === 'glowing-hexagons' || activeTheme === 'dark-live' || activeTheme === 'light-live') {
        // 1. Drifting ambient light spots
        for (let b of ambientBlobs) {
          b.x += b.vx;
          b.y += b.vy;

          if (b.x < 0 || b.x > width) b.vx *= -1;
          if (b.y < 0 || b.y > height) b.vy *= -1;

          const grad = ctx.createRadialGradient(b.x, b.y, 10, b.x, b.y, b.radius);
          grad.addColorStop(0, b.color);
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
          ctx.fill();
        }

        // 2. Cursor glow follow
        const mouseGrad = ctx.createRadialGradient(mouse.x, mouse.y, 10, mouse.x, mouse.y, 220);
        mouseGrad.addColorStop(0, 'rgba(56, 189, 248, 0.08)');
        mouseGrad.addColorStop(0.5, 'rgba(251, 146, 60, 0.03)');
        mouseGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = mouseGrad;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 220, 0, Math.PI * 2);
        ctx.fill();

        // 3. Circuit packets / data streams
        for (let p of circuitPackets) {
          p.x += p.vx;
          p.y += p.vy;

          if (p.x < 0 || p.x > width) p.vx *= -1;
          if (p.y < 0 || p.y > height) p.vy *= -1;

          // Occasionally turn angles to mimic circuit paths
          if (Math.random() < 0.02) {
            const angle = (Math.round(Math.random() * 6) * Math.PI) / 3; // 60 degree turns
            const speed = 0.5 + Math.random() * 0.5;
            p.vx = Math.cos(angle) * speed;
            p.vy = Math.sin(angle) * speed;
          }

          p.history.push({ x: p.x, y: p.y });
          if (p.history.length > 20) p.history.shift();

          ctx.beginPath();
          for (let k = 0; k < p.history.length; k++) {
            const h = p.history[k];
            if (k === 0) ctx.moveTo(h.x, h.y);
            else ctx.lineTo(h.x, h.y);
          }
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 0.8;
          ctx.globalAlpha = 0.2;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = 0.5;
          ctx.fill();
        }
        ctx.globalAlpha = 1.0;

      } else if (activeTheme === 'synthwave-landscape') {
        // 1. Stars twinkle
        for (let s of stars) {
          s.opacity += s.speed;
          if (s.opacity > 1 || s.opacity < 0) s.speed *= -1;

          ctx.beginPath();
          ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.globalAlpha = Math.max(0.1, Math.min(1, s.opacity));
          ctx.fill();
        }
        ctx.globalAlpha = 1.0;

        // 2. Pulse of the neon sun (at center horizon)
        const sunX = width / 2;
        const sunY = height * 0.44;
        const pulse = 1 + Math.sin(Date.now() * 0.0012) * 0.025;
        const sunRadius = 85 * pulse;

        const sunGlow = ctx.createRadialGradient(sunX, sunY, sunRadius * 0.1, sunX, sunY, sunRadius * 2);
        sunGlow.addColorStop(0, 'rgba(244, 63, 94, 0.14)');
        sunGlow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sunGlow;
        ctx.beginPath();
        ctx.arc(sunX, sunY, sunRadius * 2, 0, Math.PI * 2);
        ctx.fill();

        // 3. Grid line travel animation
        const horizonY = height * 0.50;
        const roadHeight = height - horizonY;
        
        gridOffset += 0.8;
        if (gridOffset >= 30) gridOffset = 0;

        ctx.strokeStyle = 'rgba(244, 63, 94, 0.24)';
        ctx.lineWidth = 1.5;
        const lineCount = 20;

        // Perspective vertical lanes
        for (let i = 0; i <= lineCount; i++) {
          const ratio = i / lineCount;
          const hX = width / 2 + (ratio - 0.5) * (width * 0.15) + (mouse.x - width / 2) * 0.015;
          const bX = width / 2 + (ratio - 0.5) * (width * 1.6) + (mouse.x - width / 2) * 0.08;

          ctx.beginPath();
          ctx.moveTo(hX, horizonY);
          ctx.lineTo(bX, height);
          ctx.stroke();
        }

        // Forward grid line movement
        const horizLines = 10;
        for (let i = 0; i < horizLines; i++) {
          const norm = (i / horizLines);
          const progress = Math.pow(norm, 2.5); // exponential speed spacing
          const currentY = horizonY + progress * roadHeight + (gridOffset * (1 - progress) * 0.5);

          if (currentY > horizonY && currentY < height) {
            ctx.beginPath();
            ctx.moveTo(0, currentY);
            ctx.lineTo(width, currentY);
            ctx.strokeStyle = `rgba(244, 63, 94, ${0.12 + (progress * 0.28)})`;
            ctx.lineWidth = 1 + progress * 2.2;
            ctx.stroke();
          }
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      if (activeTheme === 'cyber-corridor') initCorridorStreaks();
      else if (activeTheme === 'glowing-hexagons' || activeTheme === 'dark-live' || activeTheme === 'light-live') initHexagons();
      else if (activeTheme === 'synthwave-landscape') initSynthwave();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [activeTheme]);

  const isClassic = ['dark-teal', 'dark-purple', 'dark-blue', 'dark-amber'].includes(activeTheme);
  const isLive = ['cyber-corridor', 'glowing-hexagons', 'synthwave-landscape', 'dark-live', 'light-live'].includes(activeTheme);
  
  const wallpaperImages = {
    'cyber-corridor': '/neon_corridor.png',
    'glowing-hexagons': '/glowing_hexagons.png',
    'synthwave-landscape': '/synthwave_landscape.png',
    'dark-live': '/glowing_hexagons.png',
    'light-live': '/glowing_hexagons.png'
  };

  const bgImage = wallpaperImages[activeTheme] || '';

  return (
    <div 
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        background: '#050d12',
        transition: 'background 0.5s ease',
      }}
    >
      {/* Background image for live wallpapers */}
      {isLive && bgImage && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${bgImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 1,
            transition: 'background-image 0.5s ease',
            filter: 'brightness(0.55) contrast(1.05)', // Keeps background dim and makes dashboard UI crystal clear and readable
            width: '100%',
            height: '100%',
          }}
        />
      )}

      {/* WebGL Canvas for Classic Rotating 3D Shape */}
      <canvas 
        ref={glCanvasRef} 
        id="bg-canvas" 
        style={{ 
          position: 'absolute', 
          inset: 0, 
          display: isClassic ? 'block' : 'none',
          opacity: 0.8,
          width: '100%',
          height: '100%'
        }} 
      />

      {/* 2D Canvas for Live Wallpaper Interactive Animations */}
      <canvas
        ref={canvas2DRef}
        style={{
          position: 'absolute',
          inset: 0,
          display: isLive ? 'block' : 'none',
          opacity: 0.95,
          width: '100%',
          height: '100%'
        }}
      />
    </div>
  );
}
