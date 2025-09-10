// Custom cursor
const cursor = document.querySelector('.cursor');
const links = document.querySelectorAll('a, button, .content-card, .time-slot, .calendar-day');

document.addEventListener('mousemove', (e) => {
    cursor.style.left = e.clientX - 10 + 'px';
    cursor.style.top = e.clientY - 10 + 'px';
});

links.forEach(link => {
    link.addEventListener('mouseenter', () => {
        cursor.classList.add('hover');
    });
    link.addEventListener('mouseleave', () => {
        cursor.classList.remove('hover');
    });
});

// Navbar scroll effect
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});

// Smooth scrolling for nav links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
            
        }
    });
});

// Calendar functionality
function generateCalendar() {
    const calendar = document.getElementById('calendar');
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    // Clear existing calendar
    calendar.innerHTML = '';
    
    // Get days in month
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
    
    // Create calendar days
    for (let i = 0; i < firstDayOfMonth; i++) {
        const emptyDay = document.createElement('div');
        emptyDay.className = 'calendar-day';
        calendar.appendChild(emptyDay);
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        dayElement.textContent = day;
        
        // Only allow future dates
        const dayDate = new Date(currentYear, currentMonth, day);
        if (dayDate >= today || day === today.getDate()) {
            dayElement.addEventListener('click', () => {
                // Remove previous selection
                document.querySelectorAll('.calendar-day.selected').forEach(d => {
                    d.classList.remove('selected');
                });
                dayElement.classList.add('selected');
                
                // Update hidden input
                const selectedDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dateInput = document.getElementById('selected-date');
                if (dateInput) {
                    dateInput.value = selectedDate;
                }
                
                checkSelectionComplete();
            });
        } else {
            dayElement.style.opacity = '0.3';
            dayElement.style.cursor = 'not-allowed';
        }
        
        calendar.appendChild(dayElement);
    }
}

// Time slot selection
document.querySelectorAll('.time-slot').forEach(slot => {
    slot.addEventListener('click', () => {
        // Remove previous selection
        document.querySelectorAll('.time-slot.selected').forEach(s => {
            s.classList.remove('selected');
        });
        slot.classList.add('selected');
        
        // Update hidden input
        const timeInput = document.getElementById('selected-time');
        if (timeInput) {
            timeInput.value = slot.textContent;
        }
        
        checkSelectionComplete();
    });
});


// Three.js Scene for floating GLB models
const canvas = document.getElementById('three-canvas');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true });

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);

// Add lighting to show textures properly
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 10, 5);
scene.add(directionalLight);

// GLTFLoader for loading .glb files
const loader = new THREE.GLTFLoader();
const floatingModels = [];

// Load available GLB models from server
async function loadAvailableModels() {
    try {
        const response = await fetch('/api/models');
        const models = await response.json();
        
        console.log('Available models:', models);
        
        // Load each model and create floating instances distributed around header
        for (let i = 0; i < models.length; i++) {
            const modelInfo = models[i];
            await loadAndCreateFloatingModel(modelInfo.url, modelInfo.name, i, models.length);
        }
        
        // If no models found, create a fallback
        if (models.length === 0) {
            console.log('No GLB models found, creating geometric shapes as fallback');
            createFallbackShapes();
        }
        
    } catch (error) {
        console.error('Failed to load models list:', error);
        createFallbackShapes();
    }
}

// Load GLB model and create floating instances
async function loadAndCreateFloatingModel(modelUrl, modelName, modelIndex, totalModels) {
    return new Promise((resolve, reject) => {
        loader.load(
            modelUrl,
            (gltf) => {
                console.log(`Successfully loaded model: ${modelName}`);
                
                // Create distributed positions around the header area
                const positions = createDistributedPositions(totalModels);
                const modelPositions = positions.filter((_, index) => index % totalModels === modelIndex);
                
                // Adjust scale based on model type
                let scale = 1.2;
                if (modelName.includes('duck')) scale = 1.5;
                else if (modelName.includes('tiktok')) scale = 2.0;
                else if (modelName.includes('youtube')) scale = 1.8;
                else if (modelName.includes('davinci')) scale = 1.6;
                
                modelPositions.forEach((position, i) => {
                    const modelClone = gltf.scene.clone();
                    
                    // Fixed positions
                    modelClone.position.set(
                        position.x,
                        position.y,
                        position.z
                    );
                    
                    // Varied initial rotation
                    modelClone.rotation.set(0, Math.PI * 0.4 * (modelIndex + i), 0);
                    
                    modelClone.scale.set(scale, scale, scale);
                    
                    // Store animation data for gentle bobbing
                    modelClone.userData = {
                        originalY: modelClone.position.y,
                        originalRotY: modelClone.rotation.y,
                        floatSpeed: 1.0 + (modelIndex * 0.2) + (i * 0.15),
                        rotateSpeed: 0.3 + (modelIndex * 0.1) + (i * 0.1),
                        fixedPosition: { ...position },
                        modelName: modelName
                    };
                    
                    scene.add(modelClone);
                    floatingModels.push(modelClone);
                });
                
                resolve(gltf);
            },
            (progress) => {
                console.log(`Loading progress for ${modelName}:`, (progress.loaded / progress.total * 100) + '%');
            },
            (error) => {
                console.error(`Failed to load model ${modelName}:`, error);
                reject(error);
            }
        );
    });
}

// Create distributed positions for models around the header area
function createDistributedPositions(totalModels) {
    const positions = [
        // Top area positions
        { x: -14, y: 6, z: -3 },   // Far left top
        { x: -8, y: 8, z: -4 },    // Left top
        { x: 8, y: 8, z: -4 },     // Right top
        { x: 14, y: 6, z: -3 },    // Far right top
        
        // Middle-side positions
        { x: -16, y: 2, z: -5 },   // Left middle
        { x: 16, y: 2, z: -5 },    // Right middle
        
        // Bottom area positions  
        { x: -12, y: -6, z: -4 },  // Left bottom
        { x: 12, y: -6, z: -4 },   // Right bottom
        
        // Additional scattered positions
        { x: -4, y: 4, z: -6 },    // Left center high
        { x: 4, y: 4, z: -6 },     // Right center high
        { x: -6, y: -2, z: -5 },   // Left center low
        { x: 6, y: -2, z: -5 }     // Right center low
    ];
    
    // Return only the number of positions we need, distributed evenly
    const step = Math.floor(positions.length / Math.max(totalModels, 1));
    const selectedPositions = [];
    
    for (let i = 0; i < Math.min(totalModels * 2, positions.length); i += step) {
        selectedPositions.push(positions[i]);
    }
    
    return selectedPositions;
}

// Fallback geometric shapes if no GLB models are available
function createFallbackShapes() {
    const positions = createDistributedPositions(4); // Create 4 fallback shapes
    const colors = [0xff6b6b, 0x4ecdc4, 0xffdd44, 0x96ceb4];
    
    for (let i = 0; i < Math.min(4, positions.length); i++) {
        const geometry = new THREE.SphereGeometry(1, 16, 16);
        const material = new THREE.MeshBasicMaterial({ 
            color: colors[i % colors.length],
            transparent: true,
            opacity: 0.8
        });
        const shape = new THREE.Mesh(geometry, material);
        
        // Fixed positions
        shape.position.set(
            positions[i].x,
            positions[i].y,
            positions[i].z
        );
        
        // Slight initial rotation
        shape.rotation.set(0, Math.PI * 0.3 * i, 0);
        
        // Store animation data for gentle bobbing
        shape.userData = {
            originalY: shape.position.y,
            originalRotY: shape.rotation.y,
            floatSpeed: 1.0 + i * 0.2,
            rotateSpeed: 0.3 + i * 0.1,
            fixedPosition: { ...positions[i] },
            modelName: `fallback_${i}`
        };
        
        scene.add(shape);
        floatingModels.push(shape);
    }
}

camera.position.z = 15;

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    const time = Date.now() * 0.001;
    
    floatingModels.forEach((model, index) => {
        // Gentle bobbing motion up and down
        const bobOffset = Math.sin(time * model.userData.floatSpeed + index * 1.5) * 1.2;
        model.position.y = model.userData.originalY + bobOffset;
        
        // Keep fixed horizontal position
        model.position.x = model.userData.fixedPosition.x;
        model.position.z = model.userData.fixedPosition.z;
        
        // Gentle rotation left and right
        const rotationOffset = Math.sin(time * model.userData.rotateSpeed + index * 2) * 0.15;
        model.rotation.y = model.userData.originalRotY + rotationOffset;
        
        // Very subtle tilt during bobbing
        model.rotation.z = Math.sin(time * model.userData.floatSpeed * 0.8 + index) * 0.08;
    });
    
    renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Models stay in fixed positions

// Initialize everything
document.addEventListener('DOMContentLoaded', () => {
    // Generate calendar
    generateCalendar();
    
    // Load and start 3D scene
    loadAvailableModels().then(() => {
        console.log('All models loaded, starting animation');
        animate();
    });
    
});

// Check if both date and time are selected
function checkSelectionComplete() {
    const dateInput = document.getElementById('selected-date');
    const timeInput = document.getElementById('selected-time');
    const proceedButton = document.getElementById('proceed-to-form');
    
    if (!dateInput || !timeInput || !proceedButton) return;
    
    const hasDate = dateInput.value;
    const hasTime = timeInput.value;
    
    if (hasDate && hasTime) {
        proceedButton.disabled = false;
        proceedButton.classList.remove('opacity-50', 'cursor-not-allowed');
    } else {
        proceedButton.disabled = true;
        proceedButton.classList.add('opacity-50', 'cursor-not-allowed');
    }
}

// Start animation immediately even if models haven't loaded yet
animate();
