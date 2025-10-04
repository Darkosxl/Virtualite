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

// Function to scroll to booking form
function scrollToBooking() {
    const bookingForm = document.getElementById('unified-booking-form');
    if (bookingForm) {
        bookingForm.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
    }
}

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


// UnicornStudio animation is now initialized in index.html (replaces old WebGL shader)

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
    const animatedElements = document.querySelectorAll('.hero, .hero h1');
    
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
        
        requestAnimationFrame(measureFPS);
    }
    
    // Start FPS monitoring
    requestAnimationFrame(measureFPS);
    
    // Memory cleanup on page unload
    window.addEventListener('beforeunload', () => {
        // Clean up video elements
        document.querySelectorAll('.lazy-video').forEach(video => {
            video.pause();
            video.removeAttribute('src');
            video.load();
        });
    });
}

// Sunglasses animation removed (previously used Three.js)

// Initialize 3D Video Carousel
function init3DCarousel() {
    console.log('🎡 Starting 3D carousel initialization...');
    
    // 3D Carousel Video Data - All videos from /public/videos/
    const carouselVideos = [
        {
            id: 'umut',
            name: 'Umut',
            thumbnail: '/pictures/umutthumbnail.png',
            videoSrc: '/videos/umut.mov',
            aspectRatio: '9-16',
            width: 90,
            height: 160
        },
        {
            id: 'baran',
            name: 'Baran',
            thumbnail: '/pictures/baranthumbnail.png',
            videoSrc: '/videos/baran.mov',
            aspectRatio: '9-16',
            width: 90,
            height: 160
        },
        {
            id: 'gulizar',
            name: 'Gülizar',
            thumbnail: '/pictures/gulizarthumbnail.png',
            videoSrc: '/videos/gulizar.mov',
            aspectRatio: '9-16',
            width: 90,
            height: 160
        },
        {
            id: 'ceyda',
            name: 'Ceyda',
            thumbnail: '/pictures/ceydathumbnail.png',
            videoSrc: '/videos/ceyda.mov',
            aspectRatio: '16-9',
            width: 140,
            height: 79
        },
        {
            id: 'enis-hulli',
            name: 'Enis Hulli',
            thumbnail: '/pictures/enishullithumbnail.png',
            videoSrc: '/videos/enis hulli.mov',
            aspectRatio: '9-16',
            width: 90,
            height: 160
        },
        {
            id: 'burcu',
            name: 'Burcu',
            thumbnail: '/pictures/burcuthumbnail.png',
            videoSrc: '/videos/burcu.mp4',
            aspectRatio: '9-16',
            width: 90,
            height: 160
        },
        {
            id: 'zoe',
            name: 'Zoe',
            thumbnail: '/pictures/zoethumbnail.png',
            videoSrc: '/videos/zoe.mp4',
            aspectRatio: '1-1',
            width: 120,
            height: 120
        },
        {
            id: 'vivianguo',
            name: 'Vivian Guo',
            thumbnail: '/pictures/vivanguothumbnail.png',
            videoSrc: '/videos/vivianguo.mp4',
            aspectRatio: '1-1',
            width: 120,
            height: 120
        },
        {
            id: 'justinkan',
            name: 'Justin Kan',
            thumbnail: '/pictures/justinkanthumbnail.png',
            videoSrc: '/videos/justinkan.mp4',
            aspectRatio: '1-1',
            width: 120,
            height: 120
        },
        {
            id: 'mirofounder',
            name: 'Miro Founder',
            thumbnail: '/pictures/mirofounderthumbnail.png',
            videoSrc: '/videos/mirofounder.mp4',
            aspectRatio: '1-1',
            width: 120,
            height: 120
        },
        {
            id: 'naeemishaq',
            name: 'Naeem Ishaq',
            thumbnail: '/pictures/naeemishaqthumbnail.png',
            videoSrc: '/videos/naeemishaq.mp4',
            aspectRatio: '1-1',
            width: 120,
            height: 120
        },
        {
            id: 'displaybasketball',
            name: 'Display Basketball',
            thumbnail: '/pictures/displaybasketballthumbnail.png',
            videoSrc: '/videos/displaybasketball.mov',
            aspectRatio: '9-16',
            width: 90,
            height: 160
        },
        {
            id: 'enis',
            name: 'Enis',
            thumbnail: '/pictures/enisthumbnail.png',
            videoSrc: '/videos/enis.mov',
            aspectRatio: '1-1',
            width: 120,
            height: 120
        }
    ];

    // Initialize 3D Carousel
    const cylinder = document.getElementById('carousel-3d');
    const modal = document.getElementById('videoModal');
    const modalContent = document.getElementById('videoModalContent');
    const modalVideo = document.getElementById('modalVideo');
    const closeBtn = document.getElementById('videoModalClose');

    if (!cylinder) {
        console.error('❌ Carousel cylinder element not found');
        return false;
    }
    
    console.log('✅ Carousel cylinder element found:', cylinder);

    const isMobile = window.innerWidth < 640;
    const cylinderWidth = isMobile ? 1200 : 1800; // Increased for larger radius and better spacing
    const faceCount = carouselVideos.length;
    const faceWidth = cylinderWidth / faceCount;
    const radius = (cylinderWidth / (2 * Math.PI)) * 1.5; // Increased radius by 1.5x
    
    console.log('🎡 Carousel Setup:', {
        cylinderWidth,
        radius,
        faceCount,
        faceWidth,
        isMobile,
        videoCount: carouselVideos.length
    });

    let rotation = 0;
    let isDragging = false;
    let startX = 0;
    let currentX = 0;
    let velocity = 0;
    let animationId = null;

    // Generate carousel faces
    carouselVideos.forEach((video, index) => {
        const face = document.createElement('div');
        face.className = 'carousel-3d-face';
        face.style.width = `${video.width}px`;
        face.style.height = `${video.height}px`;
        
        const angle = (index * 360) / faceCount;
        face.style.transform = `
            translate(-50%, -50%)
            rotateY(${angle}deg)
            translateZ(${radius}px)
        `;

        console.log(`🎴 Creating carousel face ${index + 1}/${faceCount}:`, {
            name: video.name,
            angle: angle,
            width: video.width,
            height: video.height,
            transform: face.style.transform
        });

        const button = document.createElement('button');
        button.setAttribute('aria-label', `Play ${video.name} video`);
        button.dataset.videoSrc = video.videoSrc;
        button.dataset.aspectRatio = video.aspectRatio;

        const img = document.createElement('img');
        img.src = video.thumbnail;
        img.alt = `${video.name} video thumbnail`;
        img.loading = 'lazy';

        button.appendChild(img);
        face.appendChild(button);
        cylinder.appendChild(face);

        // Click to play video in modal
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            openVideoModal(video.videoSrc, video.aspectRatio);
        });
    });

    console.log(`✅ Created ${faceCount} carousel faces successfully`);

    // Apply initial rotation
    function updateRotation() {
        cylinder.style.transform = `rotateY(${rotation}deg)`;
    }

    // Drag handlers
    function onDragStart(e) {
        isDragging = true;
        startX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
        currentX = startX;
        velocity = 0;
        cylinder.style.transition = 'none';
        
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
    }

    function onDrag(e) {
        if (!isDragging) return;
        
        e.preventDefault();
        const x = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
        const deltaX = x - currentX;
        
        rotation += deltaX * 0.3;
        velocity = deltaX * 0.3;
        currentX = x;
        
        updateRotation();
    }

    function onDragEnd() {
        if (!isDragging) return;
        
        isDragging = false;
        cylinder.style.transition = 'transform 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        
        // Apply momentum
        if (Math.abs(velocity) > 0.5) {
            rotation += velocity * 15;
            updateRotation();
        }
    }

    // Event listeners for drag
    cylinder.addEventListener('mousedown', onDragStart);
    cylinder.addEventListener('mousemove', onDrag);
    cylinder.addEventListener('mouseup', onDragEnd);
    cylinder.addEventListener('mouseleave', onDragEnd);

    // Touch events
    cylinder.addEventListener('touchstart', onDragStart, { passive: false });
    cylinder.addEventListener('touchmove', onDrag, { passive: false });
    cylinder.addEventListener('touchend', onDragEnd);

    // Video modal functions
    function openVideoModal(videoSrc, aspectRatio) {
        modalVideo.src = videoSrc;
        modalVideo.muted = true;
        modalContent.className = 'video-modal-content aspect-' + aspectRatio;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // Prevent unmuting
        modalVideo.addEventListener('volumechange', function forceVideoMute() {
            if (!modalVideo.muted) {
                modalVideo.muted = true;
            }
        });
        
        modalVideo.play().catch(e => {
            console.log('Video autoplay prevented:', e);
        });
    }

    function closeVideoModal() {
        modal.classList.remove('active');
        modalVideo.pause();
        modalVideo.muted = true;
        modalVideo.src = '';
        document.body.style.overflow = '';
    }

    // Close modal handlers
    closeBtn.addEventListener('click', closeVideoModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeVideoModal();
        }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeVideoModal();
        }
    });

    // Initialize rotation
    updateRotation();
    
    console.log('✅ 3D carousel initialized successfully');
    return true;
}

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

    // UnicornStudio animation is initialized in index.html before app.js loads
    
    // Initialize 3D Carousel
    if (init3DCarousel()) {
        console.log('✅ 3D Carousel initialization complete');
    } else {
        console.error('❌ Failed to initialize 3D carousel');
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
