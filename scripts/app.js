// scripts/app.js - Versión corregida
import { getCurrentLocation, calculateDistance, cityCoordinates } from './geo.js';
import { fetchFuelStations, getMunicipalities } from './api.js';

// Función para convertir una dirección en coordenadas usando Nominatim
async function geocodeLocation(address) {
    const API_URL = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`;
    
    try {
        const response = await fetch(API_URL, {
            headers: {
                'User-Agent': 'GasolinerasApp/1.0'
            }
        });
        if (!response.ok) throw new Error('Error en el servicio de geocodificación. Código: ' + response.status);
        
        const data = await response.json();
        if (data && data.length > 0) {
            const firstResult = data[0];
            return {
                lat: parseFloat(firstResult.lat),
                lng: parseFloat(firstResult.lon)
            };
        } else {
            return null;
        }
    } catch (error) {
        console.error('Error al geocodificar:', error);
        throw new Error('No se pudo conectar al servicio de mapas. Por favor, intenta de nuevo.');
    }
}

// --- Referencias a elementos DOM ---
const elements = {
    geolocateBtn: document.getElementById('geolocate-btn'),
    searchBtn: document.getElementById('search-btn'),
    locationInput: document.getElementById('location-input'),
    resultsContainer: document.getElementById('results-container'),
    fuelTypeSelect: document.getElementById('fuel-type'),
    sortBySelect: document.getElementById('sort-by'),
    radiusSelect: document.getElementById('radius'),
    updateDate: document.getElementById('update-date'),
    loadingIndicator: document.getElementById('loading-indicator'),
    cityButtons: {
        madrid: document.getElementById('madrid-btn'),
        barcelona: document.getElementById('barcelona-btn'),
        valencia: document.getElementById('valencia-btn'),
        sevilla: document.getElementById('sevilla-btn'),
        bilbao: document.getElementById('bilbao-btn')
    },
    searchFeedback: document.getElementById('search-feedback'),
    autocompleteResults: document.getElementById('autocomplete-results')
};

// --- Estado de la aplicación ---
let appState = {
    stations: [],
    filteredStations: [],
    userLocation: null,
    lastUpdated: new Date(),
    filters: {
        fuelType: 'gasolina_95',
        sortBy: 'distance',
        radius: 10
    }
};

// --- Inicialización ---
document.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
    elements.updateDate.textContent = new Date().toLocaleDateString('es-ES', {
        day: 'numeric', month: 'long', year: 'numeric'
    });
    
    await loadStations();

    // Comprobar si hay una búsqueda guardada en localStorage
    try {
        const savedSearch = localStorage.getItem('lastSearch');
        if (savedSearch) {
            console.log("Se ha encontrado una búsqueda guardada. Cargando...");
            const { userLocation, filters, locationName } = JSON.parse(savedSearch);
            
            appState.filters = filters;
            elements.fuelTypeSelect.value = filters.fuelType;
            elements.sortBySelect.value = filters.sortBy;
            elements.radiusSelect.value = filters.radius;

            searchByCoordinates(userLocation, locationName);
        }
    } catch (e) {
        console.warn("No se pudo cargar la búsqueda desde localStorage:", e);
    }

    setupAutocomplete();
    registerEventListeners();
    
    if (!appState.userLocation) {
        renderResults();
    }
}

async function loadStations() {
    showLoading(true);
    try {
        appState.stations = await fetchFuelStations();
        appState.lastUpdated = new Date();
    } catch (error) {
        console.error('Error loading stations:', error);
        showError('Error al cargar datos de gasolineras. Inténtalo de nuevo más tarde.');
    } finally {
        showLoading(false);
    }
}

function setupAutocomplete() {
    let municipalities = [];
    getMunicipalities().then(data => { municipalities = data; });

    let searchTimeout;
    elements.locationInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        elements.autocompleteResults.innerHTML = '';
        
        const inputText = elements.locationInput.value.trim().toLowerCase();
        if (inputText.length < 3) return;

        searchTimeout = setTimeout(() => {
            const suggestions = municipalities
                .filter(m => m.toLowerCase().includes(inputText))
                .slice(0, 5);

            if (suggestions.length === 0) {
                const item = document.createElement('div');
                item.className = 'autocomplete-item';
                item.textContent = 'No se encontraron coincidencias';
                elements.autocompleteResults.appendChild(item);
                return;
            }

            suggestions.forEach(suggestionText => {
                const item = document.createElement('div');
                item.className = 'autocomplete-item';
                item.textContent = suggestionText;

                item.addEventListener('click', () => {
                    elements.locationInput.value = suggestionText;
                    elements.autocompleteResults.innerHTML = '';
                    handleManualSearch();
                });
                elements.autocompleteResults.appendChild(item);
            });
        }, 300);
    });

    // Cerrar autocompletado al hacer clic fuera
    document.addEventListener('click', (event) => {
        if (!elements.locationInput.contains(event.target)) {
            elements.autocompleteResults.innerHTML = '';
        }
    });
}

function registerEventListeners() {
    elements.geolocateBtn.addEventListener('click', handleGeolocation);

    Object.keys(elements.cityButtons).forEach(city => {
        elements.cityButtons[city].addEventListener('click', () => {
            const cityName = city.charAt(0).toUpperCase() + city.slice(1);
            searchByCoordinates(cityCoordinates[city], cityName);
        });
    });
    
    elements.searchBtn.addEventListener('click', handleManualSearch);
    
    const filterHandler = () => {
        appState.filters.fuelType = elements.fuelTypeSelect.value;
        appState.filters.sortBy = elements.sortBySelect.value;
        appState.filters.radius = parseInt(elements.radiusSelect.value);
        filterAndSortStations();
        renderResults();
    };
    
    elements.fuelTypeSelect.addEventListener('change', filterHandler);
    elements.sortBySelect.addEventListener('change', filterHandler);
    elements.radiusSelect.addEventListener('change', filterHandler);
}

// --- Manejadores de eventos y lógica principal ---

async function handleGeolocation() {
    showLoading(true);
    elements.searchFeedback.style.display = 'none'; // Ocultar feedback anterior
    try {
        const location = await getCurrentLocation();
        searchByCoordinates(location, 'tu ubicación actual');
    } catch (error) {
        showError(error.message || error);
    } finally {
        showLoading(false);
    }
}

async function handleManualSearch() {
    const locationText = elements.locationInput.value.trim();
    if (!locationText) {
        showError('Por favor, introduce una ubicación para buscar.');
        return;
    }

    showLoading(true);
    elements.searchFeedback.textContent = `Buscando "${locationText}"...`;
    elements.searchFeedback.style.display = 'block';
    elements.autocompleteResults.innerHTML = ''; // Limpiar autocompletado

    try {
        const coords = await geocodeLocation(locationText);
        if (coords) {
            searchByCoordinates(coords, locationText);
        } else {
            showError(`No se encontraron resultados para "${locationText}". Intenta con otro nombre.`);
        }
    } catch (error) {
        showError(error.message);
    } finally {
        showLoading(false);
    }
}

function searchByCoordinates(coords, locationName) {
    appState.userLocation = coords;
    elements.searchFeedback.textContent = `Mostrando resultados cerca de "${locationName}"...`;
    elements.searchFeedback.style.display = 'block';
    filterAndSortStations();
    renderResults();

    try {
        localStorage.setItem('lastSearch', JSON.stringify({
            userLocation: appState.userLocation,
            filters: appState.filters,
            locationName: locationName
        }));
    } catch (e) {
        console.warn("No se pudo guardar la búsqueda en localStorage:", e);
    }
}

function filterAndSortStations() {
    if (!appState.userLocation) return;
    
    const { fuelType, sortBy, radius } = appState.filters;

    appState.filteredStations = appState.stations
        .map(station => ({
            ...station,
            distance: calculateDistance(
                appState.userLocation.lat, appState.userLocation.lng,
                station.lat, station.lng
            )
        }))
        .filter(station => station.distance <= radius);
    
    appState.filteredStations.sort((a, b) => {
        if (sortBy === 'price') {
            const priceA = a.prices[fuelType] ?? Infinity;
            const priceB = b.prices[fuelType] ?? Infinity;
            if (priceA === priceB) return a.distance - b.distance;
            return priceA - priceB;
        }
        return a.distance - b.distance;
    });
}

// --- Renderizado y UI ---

function renderResults() {
    elements.resultsContainer.innerHTML = ''; 

    if (!appState.userLocation) {
        showPlaceholder('Usa la geolocalización o introduce una ubicación para comenzar');
        return;
    }
    
    if (appState.filteredStations.length === 0) {
        showPlaceholder('No se encontraron gasolineras', 'Intenta ampliar el radio de búsqueda o buscar en otra zona.');
        return;
    }
    
    const fuelType = appState.filters.fuelType;
    const fuelNames = {
        gasolina_95: 'Gasolina 95',
        gasolina_98: 'Gasolina 98',
        diesel: 'Diésel',
        diesel_premium: 'Diésel Premium'
    };
    
    appState.filteredStations.forEach(station => {
        const mainPrice = station.prices[fuelType];
        
        const card = document.createElement('div');
        card.className = 'station-card';

        card.innerHTML = `
            <div class="station-header">
                <h3 class="station-name">${escapeHTML(station.name)}</h3>
                <p class="station-address">${escapeHTML(station.address)}</p>
            </div>
            <div class="station-body">
                <div class="price-highlight">
                    <span>${fuelNames[fuelType]}:</span>
                    <span class="price">${mainPrice ? `${mainPrice.toFixed(3)} €/L` : 'N/A'}</span>
                </div>
                <div class="price-grid">
                    <div>Gasolina 95: ${formatPrice(station.prices.gasolina_95)}</div>
                    <div>Gasolina 98: ${formatPrice(station.prices.gasolina_98)}</div>
                    <div>Diésel: ${formatPrice(station.prices.diesel)}</div>
                    <div>Diésel Premium: ${formatPrice(station.prices.diesel_premium)}</div>
                </div>
                <div class="station-footer">
                    <span class="distance">${station.distance.toFixed(2)} km</span>
                    <span class="update">Actualizado: ${formatDate(station.lastUpdated)}</span>
                    <a href="https://www.google.com/maps?q=${station.lat},${station.lng}" target="_blank" class="map-link">Cómo llegar</a>
                </div>
            </div>
        `;

        elements.resultsContainer.appendChild(card);
    });
}

// Función para escapar HTML y prevenir XSS
function escapeHTML(str) {
    return str ? str.replace(/[&<>"']/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[tag])) : '';
}

function formatPrice(price) {
    return price ? `<span class="price">${price.toFixed(3)} €</span>` : '<span class="na">N/A</span>';
}

function formatDate(dateString) {
    if (!dateString) return 'N/D';
    try {
        const date = new Date(dateString);
        return date.toLocaleTimeString('es-ES', {
            hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short'
        });
    } catch (e) {
        return dateString;
    }
}

function showLoading(show) {
    elements.loadingIndicator.style.display = show ? 'block' : 'none';
}

function showError(message) {
    elements.searchFeedback.textContent = message;
    elements.searchFeedback.style.display = 'block';
    elements.resultsContainer.innerHTML = `
        <div class="error">
            <h3>¡Ups! Algo salió mal</h3>
            <p>${escapeHTML(message)}</p>
            <p>Intenta con estos ejemplos:</p>
            <ul>
                <li>Madrid Centro</li>
                <li>28001 (Código Postal)</li>
                <li>Avenida Diagonal, Barcelona</li>
            </ul>
        </div>
    `;
}

function showPlaceholder(title, subtitle = '') {
    elements.searchFeedback.style.display = 'none';
    elements.resultsContainer.innerHTML = `
        <div class="no-results">
            <h3>${escapeHTML(title)}</h3>
            ${subtitle ? `<p>${escapeHTML(subtitle)}</p>` : ''}
        </div>
    `;
}