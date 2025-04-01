// Map Configuration
let map;
let currentMarker = null;
let userLocationMarker = null;
let drawnRoute = null;
let drawControl = null;
let routeLayer = null;
let markerCluster = null;
let isDrawing = false;
const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
});
const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
});

// Initialize Map
function initMap() {
    // Initialize marker cluster group
    markerCluster = L.markerClusterGroup();
    // Load saved settings or use defaults
    const savedLayer = localStorage.getItem('mapDefaultLayer') || 'street';
    const savedZoom = parseInt(localStorage.getItem('mapDefaultZoom')) || 13;
    const savedLocation = JSON.parse(localStorage.getItem('mapDefaultLocation')) || [37.7749, -122.4194]; // Default to San Francisco
    
    map = L.map('map', {
        center: savedLocation,
        zoom: savedZoom,
        layers: [savedLayer === 'satellite' ? satelliteLayer : osmLayer]
    });

    // Add layer control
    const baseLayers = {
        "Street Map": osmLayer,
        "Satellite View": satelliteLayer
    };
    L.control.layers(baseLayers).addTo(map);

    // Check for saved theme
    if (localStorage.getItem('mapTheme') === 'dark') {
        document.body.classList.add('dark-mode');
        document.getElementById('darkMode').checked = true;
    }

    // If geolocation is enabled, try to locate user
    if (localStorage.getItem('geolocationEnabled') === 'true') {
        locateUser();
    }
}

// Search for location using OpenStreetMap Nominatim
async function searchLocation() {
    const searchInput = document.getElementById('searchInput');
    const searchVal = searchInput.value.trim();
    
    if (!searchVal) {
        showAlert('Please enter a location to search', 'error');
        return;
    }

    showAlert('Searching...', 'info');
    
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchVal)}`);
        const data = await response.json();
        
        if (data.length > 0) {
            const { lat, lon, display_name } = data[0];
            const location = [parseFloat(lat), parseFloat(lon)];
            
            // Remove previous marker if exists
            if (currentMarker) {
                map.removeLayer(currentMarker);
            }
            
            // Add new marker and center map
            // Add marker to cluster group instead of directly to map
            currentMarker = L.marker(location)
                .bindPopup(`<b>${display_name}</b>`)
                .openPopup();
            markerCluster.addLayer(currentMarker);
            
            map.flyTo(location, 15);
            showAlert('Location found!', 'success');
        } else {
            showAlert('Location not found', 'error');
        }
    } catch (error) {
        console.error('Search error:', error);
        showAlert('Error searching location', 'error');
    }
}

// Toggle between map layers
function toggleLayer(type) {
    if (type === 'satellite') {
        satelliteLayer.addTo(map);
        osmLayer.remove();
    } else {
        osmLayer.addTo(map);
        satelliteLayer.remove();
    }
}

// Toggle fullscreen mode
function toggleFullscreen() {
    const element = document.getElementById('map');
    if (!document.fullscreenElement) {
        element.requestFullscreen().catch(err => {
            showAlert(`Error attempting to enable fullscreen: ${err.message}`, 'error');
        });
    } else {
        document.exitFullscreen();
    }
}

// Locate user using geolocation API
function locateUser() {
    if (!navigator.geolocation) {
        showAlert('Geolocation is not supported by your browser', 'error');
        return;
    }

    showAlert('Locating...', 'info');
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const userLocation = [
                position.coords.latitude, 
                position.coords.longitude
            ];
            
            // Remove previous user marker if exists
            if (userLocationMarker) {
                map.removeLayer(userLocationMarker);
            }
            
            // Add new marker and center map
            userLocationMarker = L.marker(userLocation, {
                icon: L.divIcon({
                    className: 'user-location-marker',
                    html: '<i class="fas fa-location-dot text-red-600 text-2xl"></i>',
                    iconSize: [24, 24]
                })
            }).addTo(map)
            .bindPopup('<b>Your Location</b>')
            .openPopup();
            
            map.flyTo(userLocation, 15);
            showAlert('Location found!', 'success');
        },
        (error) => {
            console.error('Geolocation error:', error);
            showAlert(`Error getting location: ${error.message}`, 'error');
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

// Route Drawing Functions
function toggleRouteDrawing() {
    if (!isDrawing) {
        isDrawing = true;
        drawControl = new L.Control.Draw({
            draw: {
                polyline: {
                    shapeOptions: {
                        color: '#3b82f6',
                        weight: 5
                    }
                },
                polygon: false,
                circle: false,
                rectangle: false,
                marker: false
            },
            edit: false
        }).addTo(map);

        map.on('draw:created', function(e) {
            const layer = e.layer;
            drawnRoute = layer;
            routeLayer = L.featureGroup([layer]).addTo(map);
            calculateRouteDetails(layer);
        });

        showAlert('Drawing mode activated. Click on map to start drawing route.', 'info');
    } else {
        disableDrawing();
    }
}

function disableDrawing() {
    isDrawing = false;
    if (drawControl) {
        drawControl.remove();
    }
    showAlert('Drawing mode deactivated', 'info');
}

function clearRoute() {
    if (routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = null;
        drawnRoute = null;
    }
    document.getElementById('route-distance').textContent = '0 km';
    document.getElementById('route-time').textContent = '0 min';
    showAlert('Route cleared', 'success');
}

function calculateRouteDetails(route) {
    const latLngs = route.getLatLngs();
    let totalDistance = 0;
    
    for (let i = 0; i < latLngs.length - 1; i++) {
        totalDistance += latLngs[i].distanceTo(latLngs[i + 1]);
    }
    
    // Convert meters to kilometers
    const distanceKm = (totalDistance / 1000).toFixed(2);
    // Estimate time (5km/h walking speed)
    const timeMin = Math.round((distanceKm / 5) * 60);
    
    document.getElementById('route-distance').textContent = `${distanceKm} km`;
    document.getElementById('route-time').textContent = `${timeMin} min`;
    document.getElementById('route-modal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('route-modal').classList.add('hidden');
}

function saveRoute() {
    if (drawnRoute) {
        const routes = JSON.parse(localStorage.getItem('savedRoutes') || '[]');
        routes.push({
            coordinates: drawnRoute.getLatLngs().map(ll => [ll.lat, ll.lng]),
            distance: document.getElementById('route-distance').textContent,
            time: document.getElementById('route-time').textContent,
            timestamp: new Date().toISOString()
        });
        localStorage.setItem('savedRoutes', JSON.stringify(routes));
        showAlert('Route saved successfully!', 'success');
        closeModal();
    }
}

// Weather Functions
let weatherData = null;
const WEATHER_API_KEY = 'YOUR_OPENWEATHERMAP_API_KEY'; // Replace with actual API key

async function showWeather() {
    const center = map.getCenter();
    try {
        const response = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?lat=${center.lat}&lon=${center.lng}&units=metric&appid=${WEATHER_API_KEY}`
        );
        weatherData = await response.json();
        updateWeatherDisplay();
    } catch (error) {
        showAlert('Failed to fetch weather data', 'error');
        console.error('Weather API error:', error);
    }
}

function updateWeatherDisplay() {
    if (!weatherData) return;
    
    const weatherPanel = document.getElementById('weather-panel');
    const iconCode = weatherData.weather[0].icon;
    
    // Update weather elements
    document.getElementById('weather-icon').src = `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
    document.getElementById('weather-temp').textContent = `${Math.round(weatherData.main.temp)}°C`;
    document.getElementById('weather-desc').textContent = weatherData.weather[0].description;
    document.getElementById('weather-location').textContent = weatherData.name;
    document.getElementById('weather-humidity').textContent = weatherData.main.humidity;
    document.getElementById('weather-wind').textContent = weatherData.wind.speed;
    
    // Show weather panel
    weatherPanel.classList.remove('hidden');
    
    // Update weather when map moves
    map.on('moveend', updateWeatherOnMove);
}

function updateWeatherOnMove() {
    if (document.getElementById('weather-panel').classList.contains('hidden')) {
        map.off('moveend', updateWeatherOnMove);
        return;
    }
    showWeather();
}

function hideWeather() {
    document.getElementById('weather-panel').classList.add('hidden');
    map.off('moveend', updateWeatherOnMove);
}

// Save settings to localStorage
function saveSettings() {
    // Theme
    const darkModeEnabled = document.getElementById('darkMode').checked;
    localStorage.setItem('mapTheme', darkModeEnabled ? 'dark' : 'light');
    
    // Map preferences
    localStorage.setItem('mapDefaultLayer', document.getElementById('layerSelect').value);
    localStorage.setItem('mapDefaultZoom', document.getElementById('zoomSelect').value);
    
    // Location services
    localStorage.setItem('geolocationEnabled', document.getElementById('geolocation').checked ? 'true' : 'false');
    
    // Apply theme immediately
    if (darkModeEnabled) {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
    
    showAlert('Settings saved successfully!', 'success');
}

// Show alert message
function showAlert(message, type, duration = 3000) {
    const alertBox = document.createElement('div');
    alertBox.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-1000 ${
        type === 'error' ? 'bg-red-500' : 
        type === 'success' ? 'bg-green-500' : 
        'bg-blue-500'
    } text-white`;
    alertBox.textContent = message;
    document.body.appendChild(alertBox);
    
    setTimeout(() => {
        alertBox.classList.add('opacity-0', 'transition-opacity', 'duration-500');
        setTimeout(() => alertBox.remove(), 500);
    }, duration);
}

// Load saved settings when settings page loads
function loadSettings() {
    // Theme
    if (localStorage.getItem('mapTheme') === 'dark') {
        document.getElementById('darkMode').checked = true;
    }
    
    // Map preferences
    const savedLayer = localStorage.getItem('mapDefaultLayer') || 'street';
    document.getElementById('layerSelect').value = savedLayer;
    
    const savedZoom = parseInt(localStorage.getItem('mapDefaultZoom')) || 13;
    document.getElementById('zoomSelect').value = savedZoom;
    
    // Location services
    if (localStorage.getItem('geolocationEnabled') === 'true') {
        document.getElementById('geolocation').checked = true;
    }
}

// Initialize based on current page
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('map')) {
        initMap();
        // Add cluster group to map after initialization
        if (map) {
            map.addLayer(markerCluster);
        }
    }
    
    if (document.getElementById('darkMode')) {
        loadSettings();
    }
});

// Dark mode toggle handler
document.addEventListener('DOMContentLoaded', () => {
    const darkModeToggle = document.getElementById('darkMode');
    if (darkModeToggle) {
        darkModeToggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                document.body.classList.add('dark-mode');
            } else {
                document.body.classList.remove('dark-mode');
            }
        });
    }
});