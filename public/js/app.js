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
    const calendar = document.getElementById('calendar-grid');
    if (!calendar) {
        console.warn('Calendar element not found, skipping calendar generation');
        return;
    }

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


// WebGL Shader Animation for hero section
let shaderCanvas, gl, shaderProgram, animationId = null;
let isShaderActive = false;
let startTime = Date.now();

function initShaderAnimation() {
    shaderCanvas = document.getElementById('shader-canvas');
    if (!shaderCanvas) {
        console.error('❌ Shader canvas not found!');
        return false;
    }

    gl = shaderCanvas.getContext('webgl') || shaderCanvas.getContext('experimental-webgl');
    if (!gl) {
        console.error('❌ WebGL not supported!');
        return false;
    }

    // Calculate hero center and radius for perfect circle
    const viewportHeight = window.innerHeight;
    const heroCenterY = viewportHeight * 0.5; // Hero center is at 50vh from top
    const pageHeight = document.documentElement.scrollHeight;
    
    // Radius = distance from hero center to bottom of page
    const radius = pageHeight - heroCenterY;
    
    // Canvas is a SQUARE with dimensions 2R x 2R (diameter)
    const canvasSize = radius * 2;
    shaderCanvas.width = canvasSize;
    shaderCanvas.height = canvasSize;
    
    // Position canvas so its CENTER aligns with hero section center
    // Canvas top = hero center Y - radius
    shaderCanvas.style.top = `${heroCenterY - radius}px`;
    shaderCanvas.style.left = `${(window.innerWidth - canvasSize) / 2}px`;
    
    gl.viewport(0, 0, shaderCanvas.width, shaderCanvas.height);
    
    console.log('📐 Canvas Setup:', {
        heroCenterY,
        radius,
        canvasSize,
        canvasTop: heroCenterY - radius,
        pageHeight
    });

    // Vertex shader
    const vertexShaderSource = `
        attribute vec2 position;
        void main() {
            gl_Position = vec4(position, 0.0, 1.0);
        }
    `;

    // Fragment shader - simple circle centered at canvas center
    const fragmentShaderSource = `
        #ifdef GL_ES
        precision highp float;
        #endif

        #define TWO_PI 6.2831853072
        #define PI 3.14159265359

        uniform vec2 resolution;
        uniform float time;

        void main(void) {
            // Canvas center is our circle center (perfect and simple!)
            vec2 center = resolution * 0.5;
            vec2 pixelPos = gl_FragCoord.xy - center;

            // Normalize by radius (half of canvas size) to keep perfect circle
            float radius = resolution.x * 0.5; // Width = Height, so either works
            vec2 uv = pixelPos / radius;
            
            float t = time * 0.05;
            float lineWidth = 0.002;

            vec3 color = vec3(0.0);
            for(int j = 0; j < 3; j++){
                for(int i = 0; i < 5; i++){
                    color[j] += lineWidth * float(i * i) / abs(fract(t - 0.01 * float(j) + float(i) * 0.01) * 5.0 - length(uv) + mod(uv.x + uv.y, 0.2));
                }
            }

            gl_FragColor = vec4(color[0], color[1], color[2], 1.0);
        }
    `;

    // Compile shaders
    const vertexShader = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

    if (!vertexShader || !fragmentShader) {
        return false;
    }

    // Create and link program
    shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        console.error('❌ Program link error:', gl.getProgramInfoLog(shaderProgram));
        return false;
    }

    gl.useProgram(shaderProgram);

    // Set up geometry (full-screen quad)
    const positions = new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
         1,  1
    ]);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(shaderProgram, 'position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    console.log('✅ Shader animation initialized');
    return true;
}

function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('❌ Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }

    return shader;
}

function animateShader() {
    if (!isShaderActive) return;

    animationId = requestAnimationFrame(animateShader);

    const currentTime = (Date.now() - startTime) * 0.001; // Convert to seconds

    // Set uniforms
    const resolutionLocation = gl.getUniformLocation(shaderProgram, 'resolution');
    const timeLocation = gl.getUniformLocation(shaderProgram, 'time');

    gl.uniform2f(resolutionLocation, shaderCanvas.width, shaderCanvas.height);
    gl.uniform1f(timeLocation, currentTime);

    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function startShaderAnimation() {
    if (!isShaderActive) {
        isShaderActive = true;
        startTime = Date.now();
        animateShader();
    }
}

function stopShaderAnimation() {
    isShaderActive = false;
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
}

// Handle window resize - OPTIMIZED
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (shaderCanvas && gl) {
            // Recalculate canvas size and position
            const viewportHeight = window.innerHeight;
            const heroCenterY = viewportHeight * 0.5;
            const pageHeight = document.documentElement.scrollHeight;
            const radius = pageHeight - heroCenterY;
            const canvasSize = radius * 2;
            
            shaderCanvas.width = canvasSize;
            shaderCanvas.height = canvasSize;
            shaderCanvas.style.top = `${heroCenterY - radius}px`;
            shaderCanvas.style.left = `${(window.innerWidth - canvasSize) / 2}px`;
            
            gl.viewport(0, 0, shaderCanvas.width, shaderCanvas.height);
        }
    }, 100);
});

// Intersection Observer for smart shader loading
function setupIntersectionObserver() {
    const heroSection = document.querySelector('.hero');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                startShaderAnimation();
            } else {
                stopShaderAnimation();
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '100px'
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
    
    // Start FPS monitoring when shader animation is active
    if (isShaderActive) {
        requestAnimationFrame(measureFPS);
    }
    
    // Memory cleanup on page unload
    window.addEventListener('beforeunload', () => {
        // Stop shader animation
        stopShaderAnimation();

        // Clean up WebGL resources
        if (gl && shaderProgram) {
            gl.deleteProgram(shaderProgram);
        }

        // Clean up video elements
        document.querySelectorAll('.lazy-video').forEach(video => {
            video.pause();
            video.removeAttribute('src');
            video.load();
        });
    });
}

// Sunglasses animation removed (previously used Three.js)

// Main initialization function - called explicitly from index.html
function initializeApp() {
    console.log('app.js initializeApp() called...');

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

    // Initialize WebGL shader animation
    console.log('🚀 Starting shader animation initialization...');
    if (initShaderAnimation()) {
        console.log('✅ Shader animation initialized successfully');
        setupIntersectionObserver();
        // Start immediately since hero is likely visible on load
        startShaderAnimation();
    } else {
        console.error('❌ Failed to initialize shader animation - see errors above');
    }
}

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
