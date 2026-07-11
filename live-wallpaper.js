// live-wallpaper.js
// Implements an interactive "Cognitive Neural Network" (Constellation) background.
// Connects nodes that drift near each other and reacts to the user's cursor.

(() => {
  const canvas = document.getElementById('live-wallpaper-3d');
  const toggle = document.getElementById('live-wallpaper-toggle');
  
  if (!canvas || !window.THREE) return;

  // Renderer
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0); // Transparent to allow app background

  // Scene & Camera
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 4000);
  camera.position.z = 1000;

  // Read theme colors from CSS variables periodically or on load
  function getThemeColor(varName, defaultHex) {
    const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    if (val) {
      // Create a temporary element to parse standard CSS colors into hex for ThreeJS
      const tempDiv = document.createElement('div');
      tempDiv.style.color = val;
      document.body.appendChild(tempDiv);
      const computedColor = getComputedStyle(tempDiv).color;
      document.body.removeChild(tempDiv);
      
      const rgbMatch = computedColor.match(/\d+/g);
      if (rgbMatch && rgbMatch.length >= 3) {
        return new THREE.Color(`rgb(${rgbMatch[0]}, ${rgbMatch[1]}, ${rgbMatch[2]})`);
      }
    }
    return new THREE.Color(defaultHex);
  }

  let nodeColor = getThemeColor('--primary-color', '#6366f1');
  let lineColor = getThemeColor('--neon-accent', '#06b6d4');

  // Particles / Nodes
  const particleCount = 250; // Optimized for performance while looking dense enough
  const maxDistance = 250;   // Threshold to draw connecting lines
  const mouseDistance = 350; // Threshold for mouse interaction

  const positions = new Float32Array(particleCount * 3);
  const velocities = [];
  
  // Create particle positions and velocities
  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 2500;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 2500;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 2500;
    
    velocities.push({
      x: (Math.random() - 0.5) * 1.5,
      y: (Math.random() - 0.5) * 1.5,
      z: (Math.random() - 0.5) * 1.5
    });
  }

  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  
  const particleMaterial = new THREE.PointsMaterial({
    color: nodeColor,
    size: 4,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const particles = new THREE.Points(particleGeometry, particleMaterial);
  scene.add(particles);

  // Line Geometry for Neural Links
  // Max possible lines = (particleCount * (particleCount - 1)) / 2
  // We'll allocate a large enough buffer, but only draw the active ones
  const linePositions = new Float32Array(particleCount * particleCount * 3);
  const lineColors = new Float32Array(particleCount * particleCount * 3);
  
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3).setUsage(THREE.DynamicDrawUsage));
  lineGeometry.setAttribute('color', new THREE.BufferAttribute(lineColors, 3).setUsage(THREE.DynamicDrawUsage));

  const lineMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const linesMesh = new THREE.LineSegments(lineGeometry, lineMaterial);
  scene.add(linesMesh);

  // Interaction
  const mouse = new THREE.Vector2(-9999, -9999);
  const raycaster = new THREE.Raycaster();
  const mousePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const mouse3D = new THREE.Vector3(-9999, -9999, 0);

  window.addEventListener('mousemove', (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    // Project mouse onto a 3D plane at z=0
    raycaster.setFromCamera(mouse, camera);
    raycaster.ray.intersectPlane(mousePlane, mouse3D);
  });

  // Handle touch events
  window.addEventListener('touchmove', (event) => {
    if(event.touches.length > 0) {
      mouse.x = (event.touches[0].clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.touches[0].clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      raycaster.ray.intersectPlane(mousePlane, mouse3D);
    }
  });

  // Track Theme Changes (observe body class/data-theme changes)
  const observer = new MutationObserver(() => {
    nodeColor = getThemeColor('--primary-color', '#6366f1');
    lineColor = getThemeColor('--neon-accent', '#06b6d4');
    particleMaterial.color = nodeColor;
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  let animationId = null;
  let isEnabled = localStorage.getItem('cognify_live_wallpaper_3d') === 'true';

  const animate = () => {
    if (!isEnabled) return;
    
    const posAttr = particleGeometry.attributes.position.array;
    
    let vertexIndex = 0;
    let colorIndex = 0;
    
    // Update particle positions
    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      posAttr[i3] += velocities[i].x;
      posAttr[i3 + 1] += velocities[i].y;
      posAttr[i3 + 2] += velocities[i].z;
      
      const limit = 1250;
      if (posAttr[i3] > limit || posAttr[i3] < -limit) velocities[i].x *= -1;
      if (posAttr[i3 + 1] > limit || posAttr[i3 + 1] < -limit) velocities[i].y *= -1;
      if (posAttr[i3 + 2] > limit || posAttr[i3 + 2] < -limit) velocities[i].z *= -1;
    }
    
    particleGeometry.attributes.position.needsUpdate = true;

    // Calculate connections (O(N^2) complexity, hence limited particleCount)
    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      
      // Check mouse interaction
      const dxMouse = posAttr[i3] - mouse3D.x;
      const dyMouse = posAttr[i3 + 1] - mouse3D.y;
      const dzMouse = posAttr[i3 + 2] - mouse3D.z;
      const distMouse = Math.sqrt(dxMouse * dxMouse + dyMouse * dyMouse + dzMouse * dzMouse);
      
      // Node is drawn to mouse
      if (distMouse < mouseDistance) {
         posAttr[i3] -= (dxMouse * 0.02);
         posAttr[i3 + 1] -= (dyMouse * 0.02);
      }
      
      for (let j = i + 1; j < particleCount; j++) {
        const j3 = j * 3;
        const dx = posAttr[i3] - posAttr[j3];
        const dy = posAttr[i3 + 1] - posAttr[j3 + 1];
        const dz = posAttr[i3 + 2] - posAttr[j3 + 2];
        
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        if (dist < maxDistance) {
          // Calculate opacity based on distance
          const alpha = 1.0 - (dist / maxDistance);
          
          linePositions[vertexIndex++] = posAttr[i3];
          linePositions[vertexIndex++] = posAttr[i3 + 1];
          linePositions[vertexIndex++] = posAttr[i3 + 2];
          
          linePositions[vertexIndex++] = posAttr[j3];
          linePositions[vertexIndex++] = posAttr[j3 + 1];
          linePositions[vertexIndex++] = posAttr[j3 + 2];
          
          // Apply faded color (we inject alpha into the color roughly by lerping towards black if we wanted to, 
          // but threejs LineBasicMaterial vertexColors doesn't natively support per-vertex alpha easily in r128 without shaders.
          // We will tint it darker to simulate fading).
          lineColors[colorIndex++] = lineColor.r * alpha;
          lineColors[colorIndex++] = lineColor.g * alpha;
          lineColors[colorIndex++] = lineColor.b * alpha;
          
          lineColors[colorIndex++] = lineColor.r * alpha;
          lineColors[colorIndex++] = lineColor.g * alpha;
          lineColors[colorIndex++] = lineColor.b * alpha;
        }
      }
    }
    
    // Define how many points are actually drawn
    lineGeometry.setDrawRange(0, vertexIndex / 3);
    lineGeometry.attributes.position.needsUpdate = true;
    lineGeometry.attributes.color.needsUpdate = true;

    // Subtle parallax rotation
    const targetRotX = mouse.y * 0.05;
    const targetRotY = mouse.x * 0.05;
    scene.rotation.x += (targetRotX - scene.rotation.x) * 0.02;
    scene.rotation.y += (targetRotY - scene.rotation.y) * 0.02;
    scene.rotation.z += 0.0005; // Slow continuous spin

    renderer.render(scene, camera);
    animationId = requestAnimationFrame(animate);
  };

  const startAnimation = () => {
    canvas.style.display = 'block';
    if (!animationId) {
      animate();
    }
  };

  const stopAnimation = () => {
    canvas.style.display = 'none';
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  };

  if (toggle) {
    toggle.checked = isEnabled;
    toggle.addEventListener('change', (e) => {
      isEnabled = e.target.checked;
      localStorage.setItem('cognify_live_wallpaper_3d', isEnabled);
      if (isEnabled) {
        startAnimation();
      } else {
        stopAnimation();
      }
    });
  }

  if (isEnabled) {
    startAnimation();
  }

  const onResize = () => {
    if (!isEnabled) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', onResize);
})();
