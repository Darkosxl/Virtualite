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
                    if (timeInput) {
                        timeInput.value = timeText;
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

// Initialize Gallery Carousel
function initGalleryCarousel() {
    console.log('🎨 Starting gallery carousel initialization...');

    // Use existing video data from 3D carousel
    const galleryVideos = [
        {
            id: 'zoe',
            name: 'Zoe',
            thumbnail: '/pictures/zoethumbnail.png',
            videoSrc: 'https://res.cloudinary.com/datenhjgt/video/upload/v1759935232/zoe_oak8vp.mp4',
            aspectRatio: '1-1'
        },
        {
            id: 'vivianguo',
            name: 'Vivian Guo',
            thumbnail: '/pictures/vivanguothumbnail.png',
            videoSrc: 'https://res.cloudinary.com/datenhjgt/video/upload/v1759935228/vivianguo_oereoa.mp4',
            aspectRatio: '1-1'
        },
        {
            id: 'enis-4',
            name: 'Enis',
            thumbnail: '/pictures/enis4thumbnail.png',
            videoSrc: 'https://res.cloudinary.com/datenhjgt/video/upload/v1759935231/enis-4_ruolmq.mov',
            aspectRatio: '1-1'
        },
        {
            id: 'justinkan',
            name: 'Justin Kan',
            thumbnail: '/pictures/justinkanthumbnail.png',
            videoSrc: 'https://res.cloudinary.com/datenhjgt/video/upload/v1759935229/justinkan_lmbslz.mp4',
            aspectRatio: '1-1'
        },
        {
            id: 'enis-5',
            name: 'Enis',
            thumbnail: '/pictures/enis5thumbnail.png',
            videoSrc: 'https://res.cloudinary.com/datenhjgt/video/upload/v1759935230/enis-5_e24bbk.mov',
            aspectRatio: '1-1'
        },
        {
            id: 'mirofounder',
            name: 'Miro Founder',
            thumbnail: '/pictures/mirofounderthumbnail.png',
            videoSrc: 'https://res.cloudinary.com/datenhjgt/video/upload/v1759935224/mirofounder_tn9e0g.mp4',
            aspectRatio: '1-1'
        },
        {
            id: 'enis-6',
            name: 'Enis',
            thumbnail: '/pictures/enis6thumbnail.png',
            videoSrc: 'https://res.cloudinary.com/datenhjgt/video/upload/v1759935233/enis-6_sdlmwm.mov',
            aspectRatio: '1-1'
        },
        {
            id: 'naeemishaq',
            name: 'Naeem Ishaq',
            thumbnail: '/pictures/naeemishaqthumbnail.png',
            videoSrc: 'https://res.cloudinary.com/datenhjgt/video/upload/v1759935227/naeemishaq_e3wcag.mp4',
            aspectRatio: '1-1'
        },
        {
            id: 'enis',
            name: 'Enis',
            thumbnail: '/pictures/enisthumbnail.png',
            videoSrc: 'https://res.cloudinary.com/datenhjgt/video/upload/v1759935230/enis_olwayw.mov',
            aspectRatio: '1-1'
        },
        {
            id: 'displaybasketball',
            name: 'Display Basketball',
            thumbnail: '/pictures/displaybasketballthumbnail.png',
            videoSrc: 'https://res.cloudinary.com/datenhjgt/video/upload/v1759935229/displaybasketball_xwnyek.mov',
            aspectRatio: '9-16'
        },
        {
            id: 'enis-hulli',
            name: 'Enis Hulli',
            thumbnail: '/pictures/enishullithumbnail.png',
            videoSrc: 'https://res.cloudinary.com/datenhjgt/video/upload/v1759935229/enis_hulli_btbvvw.mov',
            aspectRatio: '9-16'
        },
    ];

    const track = document.getElementById('galleryCarouselTrack');
    const dotsContainer = document.getElementById('galleryDots');
    const prevBtn = document.querySelector('.gallery-prev');
    const nextBtn = document.querySelector('.gallery-next');
    const modal = document.getElementById('galleryVideoModal');
    const modalVideo = document.getElementById('galleryModalVideo');
    const modalContent = document.getElementById('galleryModalContent');
    const closeBtn = document.getElementById('galleryModalClose');

    if (!track || !dotsContainer) {
        console.error('❌ Gallery carousel elements not found');
        return false;
    }

    let currentSlide = 0;
    let isDragging = false;
    let startX = 0;
    let currentTranslate = 0;
    let prevTranslate = 0;

    // Create carousel items (video cards without text)
    galleryVideos.forEach((video, index) => {
        const carouselItem = document.createElement('button');
        carouselItem.className = 'gallery-carousel-item';
        carouselItem.setAttribute('aria-label', `Play ${video.name} video`);
        carouselItem.dataset.videoSrc = video.videoSrc;
        carouselItem.dataset.aspectRatio = video.aspectRatio;

        carouselItem.innerHTML = `
            <div class="gallery-item-content">
                <img src="${video.thumbnail}" alt="${video.name}" class="gallery-item-image" loading="lazy">
                <video class="gallery-item-video" loop muted playsinline>
                    <source src="${video.videoSrc}" type="video/mp4">
                </video>
                <div class="gallery-item-play-overlay">
                    <svg class="gallery-play-icon" xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                </div>
            </div>
        `;

        // Click to play video inline
        carouselItem.addEventListener('click', (e) => {
            e.stopPropagation();
            playVideoInline(carouselItem);
        });

        track.appendChild(carouselItem);

        // Create dot indicator
        const dot = document.createElement('button');
        dot.className = 'gallery-dot';
        dot.setAttribute('aria-label', `Go to slide ${index + 1}`);
        if (index === 0) dot.classList.add('active');

        dot.addEventListener('click', () => goToSlide(index));
        dotsContainer.appendChild(dot);
    });

    // Play video inline
    function playVideoInline(clickedItem) {
        const videoElement = clickedItem.querySelector('.gallery-item-video');

        // Stop all other videos in the carousel
        document.querySelectorAll('.gallery-carousel-item').forEach(item => {
            if (item !== clickedItem) {
                const otherVideo = item.querySelector('.gallery-item-video');
                if (otherVideo) {
                    otherVideo.pause();
                    otherVideo.currentTime = 0;
                }
                item.classList.remove('playing');
            }
        });

        // Toggle play/pause for clicked video
        if (clickedItem.classList.contains('playing')) {
            videoElement.pause();
            clickedItem.classList.remove('playing');
        } else {
            clickedItem.classList.add('playing');
            videoElement.play().catch(e => {
                console.log('Video autoplay prevented:', e);
            });
        }
    }

    // Update carousel position
    function updateCarousel() {
        const itemWidth = track.querySelector('.gallery-carousel-item').offsetWidth;
        const gap = 20; // 1.25rem = 20px
        const offset = currentSlide * (itemWidth + gap);

        track.style.transform = `translateX(-${offset}px)`;

        // Update dots
        document.querySelectorAll('.gallery-dot').forEach((dot, index) => {
            dot.classList.toggle('active', index === currentSlide);
        });

        // Update button states
        if (prevBtn && nextBtn) {
            prevBtn.disabled = currentSlide === 0;
            nextBtn.disabled = currentSlide === galleryVideos.length - 1;
        }
    }

    // Navigate to specific slide
    function goToSlide(index) {
        currentSlide = Math.max(0, Math.min(index, galleryVideos.length - 1));
        updateCarousel();
    }

    // Navigation handlers
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            goToSlide(currentSlide - 1);
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            goToSlide(currentSlide + 1);
        });
    }

    // Touch/drag support
    function touchStart(e) {
        isDragging = true;
        startX = e.type.includes('mouse') ? e.pageX : e.touches[0].pageX;
        track.style.transition = 'none';
    }

    function touchMove(e) {
        if (!isDragging) return;

        const currentX = e.type.includes('mouse') ? e.pageX : e.touches[0].pageX;
        const diff = currentX - startX;
        currentTranslate = prevTranslate + diff;
    }

    function touchEnd() {
        isDragging = false;
        track.style.transition = 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)';

        const movedBy = currentTranslate - prevTranslate;

        if (movedBy < -50 && currentSlide < galleryVideos.length - 1) {
            goToSlide(currentSlide + 1);
        } else if (movedBy > 50 && currentSlide > 0) {
            goToSlide(currentSlide - 1);
        } else {
            updateCarousel();
        }

        prevTranslate = currentTranslate;
    }

    // Add touch/mouse events
    track.addEventListener('mousedown', touchStart);
    track.addEventListener('touchstart', touchStart, { passive: true });
    track.addEventListener('mousemove', touchMove);
    track.addEventListener('touchmove', touchMove, { passive: true });
    track.addEventListener('mouseup', touchEnd);
    track.addEventListener('mouseleave', touchEnd);
    track.addEventListener('touchend', touchEnd);

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') {
            goToSlide(currentSlide - 1);
        } else if (e.key === 'ArrowRight') {
            goToSlide(currentSlide + 1);
        }
    });

    // Initial update
    updateCarousel();

    // Update on window resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(updateCarousel, 150);
    });

    console.log('✅ Gallery carousel initialized successfully');
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

    // Setup form view tracking
    setupFormViewTracking();

    // Setup form field tracking
    setupFormFieldTracking();

    // Setup performance monitoring
    setupPerformanceMonitoring();

    // Setup smart animation controls
    setupSmartAnimations();

    // Setup hover-based video controls for 60fps performance
    setupVideoHoverControls();

    // UnicornStudio animation is initialized in index.html before app.js loads

    // Initialize Gallery Carousel
    if (initGalleryCarousel()) {
        console.log('✅ Gallery carousel initialization complete');
    } else {
        console.error('❌ Failed to initialize gallery carousel');
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

// Track form view when user scrolls to booking form section
function setupFormViewTracking() {
    const formSection = document.querySelector('.contact-section');
    if (!formSection) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Track form view only once
                trackEvent('/track/form-view');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });

    observer.observe(formSection);
}

// Track form field filled events - fires instantly on blur (no debounce)
function setupFormFieldTracking() {
    const nameInput = document.querySelector('input[name="name"]');
    const emailInput = document.querySelector('input[name="email"]');
    const phoneInput = document.querySelector('input[name="phone_number"]');

    function trackFieldFilled(fieldName, input) {
        // Only track if field has value and hasn't been tracked yet
        if (!input.value || input.dataset.tracked === 'true') {
            return;
        }

        // Generate unique event_id for this field completion
        const eventId = (crypto.randomUUID && crypto.randomUUID()) ||
                        'field_' + fieldName + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

        const data = {
            field_name: fieldName,
            event_id: eventId,
            name: nameInput?.value || '',
            email: emailInput?.value || '',
            phone_number: phoneInput?.value || ''
        };

        // Mark field as tracked to prevent duplicates
        input.dataset.tracked = 'true';

        // Track immediately (no debounce)
        trackEvent('/track/form-field-filled', data);
    }

    // Attach blur event listeners (fires when user leaves field)
    if (nameInput) {
        nameInput.addEventListener('blur', () => {
            trackFieldFilled('name', nameInput);
        });

        // Reset tracked flag if user changes the field again
        nameInput.addEventListener('focus', () => {
            if (nameInput.dataset.tracked === 'true') {
                nameInput.dataset.tracked = 'false';
            }
        });
    }

    if (emailInput) {
        emailInput.addEventListener('blur', () => {
            trackFieldFilled('email', emailInput);
        });

        emailInput.addEventListener('focus', () => {
            if (emailInput.dataset.tracked === 'true') {
                emailInput.dataset.tracked = 'false';
            }
        });
    }

    if (phoneInput) {
        phoneInput.addEventListener('blur', () => {
            trackFieldFilled('phone_number', phoneInput);
        });

        phoneInput.addEventListener('focus', () => {
            if (phoneInput.dataset.tracked === 'true') {
                phoneInput.dataset.tracked = 'false';
            }
        });
    }
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
