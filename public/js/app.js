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

// Navbar removed - no longer needed

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
        
        // Define specific model-to-position mapping
        const modelPositions = [
            { name: 'tiktok', position: 0 },      // Top left
            { name: 'davinci', position: 1 },     // Top right
            { name: 'insta', position: 2 },       // Center left
            { name: 'premiere', position: 3 },    // Center right
            { name: 'youtube', position: 4 },     // Bottom left
            { name: 'capcut', position: 5 }       // Bottom right
        ];
        
        // Load models in specific positions
        for (const modelInfo of models) {
            const modelMapping = modelPositions.find(mapping => 
                modelInfo.name.toLowerCase().includes(mapping.name)
            );
            
            if (modelMapping) {
                await loadAndCreateFloatingModel(modelInfo.url, modelInfo.name, modelMapping.position, 6);
            }
        }
        
        // If no models found, create a fallback
        if (models.length === 0) {
            console.log('No GLB models found in assets folder');
        }
        
    } catch (error) {
        console.error('Failed to load models list:', error);
    }
}

// Load GLB model and create floating instances
async function loadAndCreateFloatingModel(modelUrl, modelName, modelIndex, totalModels) {
    return new Promise((resolve, reject) => {
        loader.load(
            modelUrl,
            (gltf) => {
                console.log(`Successfully loaded model: ${modelName}`);
                
                // Get specific position for this model
                const position = getModelPosition(modelIndex);
                
                // Skip duck model
                if (modelName.includes('duck')) {
                    resolve(gltf);
                    return;
                }
                
                // All models same volume - adjust scale based on model type
                let scale = 1.5; // Base scale for consistent volume
                if (modelName.includes('tiktok')) scale = 0.7; // TikTok is naturally larger
                else if (modelName.includes('youtube')) scale = 18.0; // YouTube is naturally smaller
                else if (modelName.includes('davinci')) scale = 1.8; // DaVinci medium size
                else if (modelName.includes('capcut')) scale = 1.6; // CapCut medium size
                else if (modelName.includes('premiere')) scale = 1.4; // Premiere Pro medium size
                else if (modelName.includes('insta')) scale = 1.7; // Instagram medium size
                else return;
                
                const modelClone = gltf.scene.clone();
                
                // Fixed positions
                modelClone.position.set(
                    position.x,
                    position.y,
                    position.z
                );
                
                // All models face toward screen with slight variations
                let rotationY = 0;
                let rotationX = 0;
                let rotationZ = 0;
                
                if (modelName.includes('tiktok')) {
                    rotationY = Math.PI * 0.1; // Slight turn toward viewer
                    rotationX = Math.PI * 0.05; // Very slight tilt
                } else if (modelName.includes('youtube')) {
                    rotationY = Math.PI * 0.2; // Turn toward viewer
                    rotationX = Math.PI * 0.1; // Slight upward tilt
                } else if (modelName.includes('davinci')) {
                    rotationY = Math.PI * 0.15; // Face viewer
                    rotationX = Math.PI * -0.05; // Slight downward tilt
                } else if (modelName.includes('capcut')) {
                    rotationY = Math.PI * -0.15; // Face viewer
                    rotationX = Math.PI * 0.06; // Slight tilt
                } else if (modelName.includes('premiere')) {
                    rotationY = Math.PI * 0.06; // Face viewer
                    rotationX = Math.PI * 0.03; // Very slight tilt
                } else if (modelName.includes('insta')) {
                    rotationY = Math.PI * 0.37; // Face viewer
                    rotationX = Math.PI * 0.04; // Slight tilt
                } else {
                    return;
                }
                
                modelClone.rotation.set(rotationX, rotationY, rotationZ);
                
                modelClone.scale.set(scale, scale, scale);
                
                // Store animation data for gentle bobbing
                modelClone.userData = {
                    originalY: modelClone.position.y,
                    originalRotY: modelClone.rotation.y,
                    floatSpeed: 1.0 + (modelIndex * 0.2),
                    rotateSpeed: 0.3 + (modelIndex * 0.1),
                    fixedPosition: { ...position },
                    modelName: modelName
                };
                
                scene.add(modelClone);
                floatingModels.push(modelClone);
                
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

// Get specific position for each model by index - 6 positions in zigzag pattern
function getModelPosition(modelIndex) {
    // Fixed positions for 6 models in zigzag pattern at consistent depth
    const positions = [
        { x: -14, y: 8, z: -4 },   // Top left (model 0)
        { x: 14, y: 8, z: -4 },    // Top right (model 1)  
        { x: -18, y: 1, z: -4 },   // Center left (model 2) - more left
        { x: 18, y: 1, z: -4 },    // Center right (model 3) - more right
        { x: -14, y: -6, z: -4 },  // Bottom left (model 4)
        { x: 14, y: -6, z: -4 }    // Bottom right (model 5)
    ];
    
    // Return position based on model index, with fallback
    return positions[modelIndex % positions.length];
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

// Handle window resize - OPTIMIZED
let resizeTimeout;
window.addEventListener('resize', () => {
    // Debounce resize events for better performance
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }, 100);
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
