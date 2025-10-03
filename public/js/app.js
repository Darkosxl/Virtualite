// Set page load time for bot protection
document.addEventListener('DOMContentLoaded', function() {
    const loadTimeInput = document.getElementById('loadTime');
    if (loadTimeInput) {
        loadTimeInput.value = new Date().getTime();
    }
});

// Custom cursor
const cursor = document.querySelector('.cursor');
const links = document.querySelectorAll('a, button, .content-card, .time-slot, .calendar-day, .nav-link');

document.addEventListener('mousemove', (e) => {
    requestAnimationFrame(() => {
        cursor.style.transform = `translate3d(${e.clientX - 10}px, ${e.clientY - 10}px, 0)`;
    });
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

// Helper function to get date without time component
function getDateOnly(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Helper function to get tomorrow's date
function getTomorrowDate() {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    return getDateOnly(tomorrow);
}

// Calendar functionality
function generateCalendar() {
    const calendar = document.getElementById('calendar');
    const today = new Date();
    const todayDateOnly = getDateOnly(today);
    const tomorrowDate = getTomorrowDate();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    // Clear existing calendar
    calendar.innerHTML = '';
    
    // Get days in current month
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
    
    // Get first week of next month
    const nextMonth = currentMonth + 1;
    const nextYear = nextMonth > 11 ? currentYear + 1 : currentYear;
    const nextMonthAdjusted = nextMonth > 11 ? 0 : nextMonth;
    
    // Create calendar days for current month
    for (let i = 0; i < firstDayOfMonth; i++) {
        const emptyDay = document.createElement('div');
        emptyDay.className = 'calendar-day';
        calendar.appendChild(emptyDay);
    }
    
    // Add current month days
    for (let day = 1; day <= daysInMonth; day++) {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        dayElement.textContent = day;
        
        const dayDate = getDateOnly(new Date(currentYear, currentMonth, day));
        const isSunday = dayDate.getDay() === 0; // Sunday is day 0

        // Only allow booking from tomorrow onwards (not today) and not on Sundays
        if (dayDate >= tomorrowDate && !isSunday) {
            dayElement.addEventListener('click', () => {
                document.querySelectorAll('.calendar-day.selected').forEach(d => {
                    d.classList.remove('selected');
                });
                dayElement.classList.add('selected');

                const selectedDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dateInput = document.getElementById('selected-date');
                if (dateInput) {
                    dateInput.value = selectedDate;
                }

                // Track date selection
                trackEvent('/track/date-select', { selected_date: selectedDate });

                // Update time slots for selected date
                updateTimeSlots(selectedDate);

                checkSelectionComplete();
            });
        } else {
            dayElement.style.opacity = '0.3';
            dayElement.style.cursor = 'not-allowed';
            dayElement.style.pointerEvents = 'none';
            if (isSunday) {
                dayElement.style.backgroundColor = 'rgba(115, 2, 2, 0.2)'; // Red tint for Sundays
            }
        }
        
        calendar.appendChild(dayElement);
    }
    
    // Calculate how many slots are remaining (max 42 for 6 weeks grid)
    const totalSlotsUsed = firstDayOfMonth + daysInMonth;
    const remainingSlots = 42 - totalSlotsUsed;
    
    // Add first week of next month (max 7 days)
    const daysToAddFromNextMonth = Math.min(7, remainingSlots);
    
    for (let day = 1; day <= daysToAddFromNextMonth; day++) {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        dayElement.textContent = day;
        dayElement.style.opacity = '0.7'; // Slightly dimmed for next month
        
        const dayDate = getDateOnly(new Date(nextYear, nextMonthAdjusted, day));
        const tomorrowDate = getTomorrowDate();
        const isSunday = dayDate.getDay() === 0; // Sunday is day 0

        // Check if this next month date is tomorrow or later and not Sunday
        if (dayDate >= tomorrowDate && !isSunday) {
            dayElement.addEventListener('click', () => {
                document.querySelectorAll('.calendar-day.selected').forEach(d => {
                    d.classList.remove('selected');
                });
                dayElement.classList.add('selected');

                const selectedDate = `${nextYear}-${String(nextMonthAdjusted + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dateInput = document.getElementById('selected-date');
                if (dateInput) {
                    dateInput.value = selectedDate;
                }

                // Track date selection
                trackEvent('/track/date-select', { selected_date: selectedDate });

                // Update time slots for selected date
                updateTimeSlots(selectedDate);

                checkSelectionComplete();
            });
        } else {
            // Next month dates that are in the past or Sundays
            dayElement.style.opacity = '0.3';
            dayElement.style.cursor = 'not-allowed';
            dayElement.style.pointerEvents = 'none';
            if (isSunday) {
                dayElement.style.backgroundColor = 'rgba(115, 2, 2, 0.2)'; // Red tint for Sundays
            }
        }
        
        calendar.appendChild(dayElement);
    }
}

// Function to update time slots based on selected date
async function updateTimeSlots(selectedDate) {
    try {
        const response = await fetch(`/api/available-slots/${selectedDate}`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const timeSlots = document.querySelectorAll('.time-slot');

        // Clear all existing event listeners and styles first
        timeSlots.forEach(slot => {
            // Reset to default state
            slot.classList.remove('booked', 'selected');
            slot.style.opacity = '1';
            slot.style.cursor = 'pointer';
            slot.style.pointerEvents = 'auto';
            slot.style.background = '';

            // Remove all existing event listeners by cloning
            const newSlot = slot.cloneNode(true);
            slot.parentNode.replaceChild(newSlot, slot);
        });

        // Re-query slots after cloning to get fresh references
        const freshTimeSlots = document.querySelectorAll('.time-slot');

        freshTimeSlots.forEach(slot => {
            const timeText = slot.textContent.trim();

            if (data.booked_slots && data.booked_slots.includes(timeText)) {
                // Slot is booked - disable it but allow hover for tooltip
                slot.classList.add('booked');
                slot.style.opacity = '0.3 !important';
                slot.style.cursor = 'not-allowed !important';
                slot.style.background = 'rgba(115, 2, 2, 0.2) !important';

                // Set tooltip with masked name if available
                const maskedName = data.booking_details && data.booking_details[timeText];
                slot.title = maskedName ? maskedName : 'Bu saat dolu';

                // Remove click functionality but keep hover for tooltip
                slot.onclick = function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                };
            } else {
                // Slot is available - enable it
                slot.classList.remove('booked');
                slot.style.opacity = '1';
                slot.style.cursor = 'pointer';
                slot.style.pointerEvents = 'auto';
                slot.style.background = '';
                slot.title = '';

                // Add click listener for available slots
                slot.addEventListener('click', function() {
                    // Remove previous selection
                    document.querySelectorAll('.time-slot.selected').forEach(s => {
                        s.classList.remove('selected');
                    });

                    // Select this slot
                    slot.classList.add('selected');

                    // Update hidden input
                    const timeInput = document.getElementById('selected-time');
                    const dateInput = document.getElementById('selected-date');
                    if (timeInput) {
                        timeInput.value = timeText;
                    }

                    // Track time selection
                    if (dateInput && dateInput.value) {
                        trackEvent('/track/time-select', {
                            selected_time: timeText,
                            selected_date: dateInput.value
                        });
                    }

                    checkSelectionComplete();
                });
            }
        });

    } catch (error) {
        console.error('Error fetching available slots:', error);

        // If API fails, ensure all slots are clickable
        const timeSlots = document.querySelectorAll('.time-slot');
        timeSlots.forEach(slot => {
            // Reset to available state
            slot.classList.remove('booked');
            slot.style.opacity = '1';
            slot.style.cursor = 'pointer';
            slot.style.pointerEvents = 'auto';
            slot.style.background = '';

            // Add fallback click listener
            slot.addEventListener('click', function() {
                const timeText = slot.textContent.trim();

                document.querySelectorAll('.time-slot.selected').forEach(s => {
                    s.classList.remove('selected');
                });
                slot.classList.add('selected');

                const timeInput = document.getElementById('selected-time');
                if (timeInput) {
                    timeInput.value = timeText;
                }

                checkSelectionComplete();
            });
        });
    }
}

// Initialize time slot selection (will be updated when date is selected)
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
let canvas, scene, camera, renderer, loader, floatingModels = [];
let is3DActive = false;
let animationId = null;

function initThreeJS() {
    canvas = document.getElementById('three-canvas');
    if (!canvas) {
        console.error('Three.js canvas not found!');
        return false;
    }

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true });

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);

    // Add lighting to show textures properly
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 5);
    scene.add(directionalLight);

    // GLTFLoader for loading .glb files
    loader = new THREE.GLTFLoader();

    return true;
}

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
    if (!is3DActive) return; // Only animate when 3D scene is active
    
    animationId = requestAnimationFrame(animate);
    
    const time = Date.now() * 0.001;
    
    floatingModels.forEach((model, index) => {
        // Gentle bobbing motion up and down (60fps smooth)
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

// Start 3D animation
function start3DAnimation() {
    if (!is3DActive) {
        is3DActive = true;
        animate();
    }
}

// Stop 3D animation  
function stop3DAnimation() {
    is3DActive = false;
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
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

// Intersection Observer for smart 3D loading
function setupIntersectionObserver() {
    const heroSection = document.querySelector('.hero');
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Hero is visible - start 3D animations at 60fps
                start3DAnimation();
            } else {
                // Hero not visible - pause 3D animations
                stop3DAnimation();
            }
        });
    }, {
        threshold: 0.1, // Trigger when 10% of hero is visible
        rootMargin: '100px' // Start loading slightly before entering viewport
    });
    
    if (heroSection) {
        observer.observe(heroSection);
    }
}

// Hover-based video loading and playback with 60fps performance
function setupVideoHoverControls() {
    const lazyVideos = document.querySelectorAll('.lazy-video');
    const deviceFrames = document.querySelectorAll('.iphone-frame, .macbook-frame, .content-card');
    
    deviceFrames.forEach((frame, index) => {
        const video = frame.querySelector('.lazy-video');
        
        if (video) {
            // Optimize video for 60fps performance
            video.style.willChange = 'transform';
            video.style.backfaceVisibility = 'hidden';
            video.style.perspective = '1000px';
            
            // Load video sources immediately to show first frame
            if (!video.src && video.dataset.src) {
                const sources = video.querySelectorAll('source');
                sources.forEach(source => {
                    if (source.dataset.src) {
                        source.src = source.dataset.src;
                    }
                });
                video.src = video.dataset.src;
                video.preload = 'metadata'; // Load enough to show first frame
                video.load();
            }
            
            // Play video on hover
            frame.addEventListener('mouseenter', () => {
                // Pause all other videos
                lazyVideos.forEach(otherVideo => {
                    if (otherVideo !== video) {
                        otherVideo.pause();
                        otherVideo.currentTime = 0; // Reset to beginning
                    }
                });
                
                // Play current video from start
                video.currentTime = 0;
                video.play().catch(e => {
                    console.log('Video play prevented:', e);
                });
            });
            
            frame.addEventListener('mouseleave', () => {
                // Don't pause video on mouse leave - let it play until completion
                // Video will continue playing until it ends naturally
            });
            
            // When video ends, reset to beginning for next hover
            video.addEventListener('ended', () => {
                video.currentTime = 0;
            });
        }
    });
}

// Smart animation pausing based on visibility
function setupSmartAnimations() {
    const animatedElements = document.querySelectorAll('.hero, .hero h1, .scroll-indicator');
    
    const animationObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const element = entry.target;
            
            if (entry.isIntersecting) {
                // Element is visible - resume animations
                element.style.animationPlayState = 'running';
            } else {
                // Element not visible - pause animations for performance
                element.style.animationPlayState = 'paused';
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '50px'
    });
    
    animatedElements.forEach(element => {
        animationObserver.observe(element);
    });
    
    // Handle prefers-reduced-motion for accessibility
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        animatedElements.forEach(element => {
            element.style.animation = 'none';
        });
    }
}

// Performance monitoring and cleanup
function setupPerformanceMonitoring() {
    // Monitor FPS for debugging (remove in production)
    let lastTime = performance.now();
    let frames = 0;
    
    function measureFPS() {
        frames++;
        const currentTime = performance.now();
        
        if (currentTime - lastTime >= 1000) {
            const fps = Math.round((frames * 1000) / (currentTime - lastTime));
            if (fps < 30) {
                console.warn('Low FPS detected:', fps);
            }
            frames = 0;
            lastTime = currentTime;
        }
        
        if (is3DActive) {
            requestAnimationFrame(measureFPS);
        }
    }
    
    // Start FPS monitoring when 3D scene is active
    if (is3DActive) {
        requestAnimationFrame(measureFPS);
    }
    
    // Memory cleanup on page unload
    window.addEventListener('beforeunload', () => {
        // Stop all animations
        stop3DAnimation();
        
        // Clean up 3D resources
        if (renderer) {
            renderer.dispose();
        }
        
        // Clean up video elements
        document.querySelectorAll('.lazy-video').forEach(video => {
            video.pause();
            video.removeAttribute('src');
            video.load();
        });
    });
}

// Sunglasses animation in calendar section
function setupSunglassesAnimation() {
    const canvas = document.getElementById('sunglasses-canvas');
    if (!canvas) return;
    
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, canvas.offsetWidth / canvas.offsetHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true });
    
    renderer.setSize(canvas.offsetWidth, canvas.offsetHeight);
    renderer.setClearColor(0x000000, 0);
    
    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 5);
    scene.add(directionalLight);
    
    let sunglassesModel = null;
    let isAnimating = false;
    
    // Load sunglasses model
    const loader = new THREE.GLTFLoader();
    loader.load('/assets/sunglasses.glb', (gltf) => {
        sunglassesModel = gltf.scene;
        sunglassesModel.scale.set(0.05, 0.05, 0.05); // Half the size - even tinier sunglasses
        sunglassesModel.position.set(35, 0, 0); // Start wayyy more to the right
        sunglassesModel.visible = false; // Hidden by default
        scene.add(sunglassesModel);
        
        console.log('Tiny sunglasses model loaded');
    }, undefined, (error) => {
        console.error('Error loading sunglasses model:', error);
    });
    
    camera.position.z = 10;
    
    // Animation function
    function animateSunglasses() {
        if (!sunglassesModel || isAnimating) return;
        
        isAnimating = true;
        sunglassesModel.visible = true;
        sunglassesModel.position.x = 15; // Start from RIGHT (off-screen)
        
        const startTime = Date.now();
        const duration = 4500; // 4.5 seconds flight time
        
        function flyAnimation() {
            const elapsed = Date.now() - startTime;
            const progress = elapsed / duration;
            
            if (progress < 1) {
                // Simple RIGHT to LEFT movement - extended 20 units more left
                sunglassesModel.position.x = 15 - (50 * progress); // +15 to -35 
                sunglassesModel.rotation.y += 0.1; // Smooth rotation
                
                renderer.render(scene, camera);
                requestAnimationFrame(flyAnimation);
            } else {
                // Simply hide it - no complex removal
                sunglassesModel.visible = false;
                sunglassesModel.position.x = 15; // Reset position for next time
                isAnimating = false;
            }
        }
        
        flyAnimation();
    }
    
    // Setup intersection observer to only animate when calendar is visible
    let animationInterval = null;
    
    const calendarSection = document.querySelector('.contact-section');
    const calendarObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Calendar is visible - start sunglasses animation
                if (!animationInterval) {
                    animationInterval = setInterval(animateSunglasses, 12000);
                    // Start first animation immediately
                    setTimeout(animateSunglasses, 1000);
                }
            } else {
                // Calendar not visible - stop sunglasses animation
                if (animationInterval) {
                    clearInterval(animationInterval);
                    animationInterval = null;
                }
            }
        });
    }, {
        threshold: 0.3 // Trigger when 30% of calendar section is visible
    });
    
    if (calendarSection) {
        calendarObserver.observe(calendarSection);
    }
    
    // Initial render
    renderer.render(scene, camera);
    
    // Handle window resize
    window.addEventListener('resize', () => {
        if (canvas.offsetWidth > 0 && canvas.offsetHeight > 0) {
            camera.aspect = canvas.offsetWidth / canvas.offsetHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(canvas.offsetWidth, canvas.offsetHeight);
        }
    });
}

// Initialize everything
document.addEventListener('DOMContentLoaded', () => {
    // Generate calendar
    generateCalendar();

    // Load time slots for tomorrow (default booking date) to show blocked slots immediately
    const tomorrow = getTomorrowDate();
    const tomorrowString = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    updateTimeSlots(tomorrowString);

    // Setup calendar view tracking
    setupCalendarViewTracking();

    // Setup performance monitoring
    setupPerformanceMonitoring();

    // Setup smart animation controls
    setupSmartAnimations();

    // Setup hover-based video controls for 60fps performance
    setupVideoHoverControls();

    // Setup sunglasses animation in calendar section
    setupSunglassesAnimation();

    // Initialize Three.js scene first, then load 3D models
    if (initThreeJS()) {
        loadAvailableModels().then(() => {
            console.log('All models loaded, setting up smart loading');
            setupIntersectionObserver();
            // Start immediately since hero is likely visible on load
            start3DAnimation();
        });
    } else {
        console.error('Failed to initialize Three.js - canvas not found');
    }

});

// Facebook event tracking helpers
function trackEvent(endpoint, data = {}) {
    fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(data)
    }).catch(e => console.log('Tracking error:', e));
}

// Track calendar view when user scrolls to calendar section
function setupCalendarViewTracking() {
    const calendarSection = document.querySelector('.contact-section');
    if (!calendarSection) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Track calendar view only once
                trackEvent('/track/calendar-view');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });

    observer.observe(calendarSection);
}

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
        proceedButton.title = ""; // Remove tooltip when enabled
        console.log('Button enabled - Date:', hasDate, 'Time:', hasTime); // Debug log
    } else {
        proceedButton.disabled = true;
        proceedButton.classList.add('opacity-50', 'cursor-not-allowed');
        proceedButton.title = "Lütfen zaman ve tarih seçin."; // Set tooltip when disabled
        console.log('Button disabled - Date:', hasDate, 'Time:', hasTime); // Debug log
    }
}


// Start animation immediately even if models haven't loaded yet
animate();

// Viewport-based video loading for mobile short videos
document.addEventListener('DOMContentLoaded', function() {
    initializeViewportVideoLoading();
});


// Viewport-based video loading for all videos
function initializeViewportVideoLoading() {
    const allVideos = document.querySelectorAll('.lazy-video');
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && entry.target.dataset.src) {
                const video = entry.target;
                const sources = video.querySelectorAll('source');
                
                // Load the video
                sources.forEach(source => {
                    if (source.dataset.src) {
                        source.src = source.dataset.src;
                        source.removeAttribute('data-src');
                    }
                });
                
                if (video.dataset.src) {
                    video.src = video.dataset.src;
                    video.removeAttribute('data-src');
                    video.load();
                }
                
                // Stop observing once loaded
                observer.unobserve(video);
            }
        });
    }, {
        threshold: 0.3 // Load when 30% visible
    });
    
    allVideos.forEach(video => {
        observer.observe(video);
    });
}
