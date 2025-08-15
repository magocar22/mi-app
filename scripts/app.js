// scripts/app.js - Versión mejorada con Diesel y Precio por defecto, URL de mapas corregida y mejoras UX
import { getCurrentLocation, calculateDistance, cityCoordinates } from './geo.js';
import { fetchFuelStations, getMunicipalities } from './api.js';

// Función para convertir una dirección en coordenadas usando Nominatim
async function geocodeLocation(address) {
    const API_URL = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`;
    
    try {
        const response = await fetch(API_URL, {
            headers: {
                'User-Agent': 'GasolinerasApp/1.0' // Es importante un User-Agent para Nominatim
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
    searchFeedback: document.getElementById('search-feedback'),
    autocompleteResults: document.getElementById('autocomplete-results')
};

// --- Estado de la aplicación (MODIFICADO: diesel por defecto, ordenar por precio) ---
let appState = {
    stations: [],
    filteredStations: [],
    userLocation: null,
    lastUpdated: new Date(),
    filters: {
        fuelType: 'diesel', // CAMBIO: Diesel por defecto
        sortBy: 'price',    // CAMBIO: Precio por defecto
        radius: 10          // Mantener 10km por defecto
    }
};

// --- Inicialización ---
document.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
    // Actualizar la fecha de última actualización en el footer
    elements.updateDate.textContent = new Date().toLocaleDateString('es-ES', {
        day: 'numeric', month: 'long', year: 'numeric'
    });
    
    // CAMBIO: Establecer valores por defecto en la interfaz al cargar
    elements.fuelTypeSelect.value = 'diesel';
    elements.sortBySelect.value = 'price';
    elements.radiusSelect.value = '10'; // Asegurarse de que el valor sea un string si en HTML es así
    
    // Llamada a loadStations con un mensaje de carga inicial
    await loadStations("Cargando datos iniciales de gasolineras..."); 

    // Comprobar si hay una búsqueda guardada en localStorage
    try {
        const savedSearch = localStorage.getItem('lastSearch');
        if (savedSearch) {
            console.log("Se ha encontrado una búsqueda guardada. Cargando...");
            const { userLocation, filters, locationName } = JSON.parse(savedSearch);
            
            appState.userLocation = userLocation;
            
            // Establecer los valores de los filtros a los guardados si existen, sino se mantienen los por defecto de appState
            // Esto asegura que si el usuario cambió los filtros y refrescó, se mantengan (pero los predeterminados si no hay nada guardado)
            appState.filters.fuelType = filters.fuelType || appState.filters.fuelType;
            appState.filters.sortBy = filters.sortBy || appState.filters.sortBy;
            appState.filters.radius = parseInt(filters.radius) || appState.filters.radius;

            elements.fuelTypeSelect.value = appState.filters.fuelType;
            elements.sortBySelect.value = appState.filters.sortBy;
            elements.radiusSelect.value = appState.filters.radius;

            searchByCoordinates(userLocation, locationName, "Cargando tu última búsqueda...");
        }
    } catch (e) {
        console.warn("No se pudo cargar la búsqueda desde localStorage:", e);
    }

    setupAutocomplete(); // Configurar el autocompletado para la búsqueda de ubicación
    registerEventListeners(); // Registrar los escuchadores de eventos para botones y filtros
    
    // Si no hay ubicación de usuario (ni por localStorage ni por geolocalización), mostrar el placeholder inicial
    if (!appState.userLocation) {
        renderResults();
    }
}

// Carga inicial de las estaciones de combustible desde la API
async function loadStations(loadingMessage = "Cargando gasolineras...") { // Acepta un mensaje
    showLoading(true, loadingMessage); // Pasa el mensaje al indicador de carga
    try {
        appState.stations = await fetchFuelStations(); // Obtener datos de las gasolineras
        appState.lastUpdated = new Date(); // Guardar la fecha de la última actualización de los datos
    } catch (error) {
        console.error('Error loading stations:', error);
        showError('Error al cargar datos de gasolineras. Por favor, inténtalo de nuevo más tarde.');
    } finally {
        showLoading(false); // Ocultar indicador de carga
    }
}

// Configuración de la funcionalidad de autocompletado para la entrada de ubicación
function setupAutocomplete() {
    let municipalities = [];
    getMunicipalities().then(data => { municipalities = data; }); // Cargar la lista de municipios

    let searchTimeout;
    elements.locationInput.addEventListener('input', () => {
        clearTimeout(searchTimeout); // Limpiar cualquier temporizador anterior
        elements.autocompleteResults.innerHTML = ''; // Limpiar resultados anteriores de autocompletado
        
        const inputText = elements.locationInput.value.trim().toLowerCase();
        if (inputText.length < 3) return; // Mostrar sugerencias solo si hay al menos 3 caracteres

        searchTimeout = setTimeout(() => {
            const suggestions = municipalities
                .filter(m => m.toLowerCase().includes(inputText)) // Filtrar municipios que coincidan
                .slice(0, 5); // Limitar a las primeras 5 sugerencias

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
                    elements.locationInput.value = suggestionText; // Rellenar la entrada con la sugerencia
                    elements.autocompleteResults.innerHTML = ''; // Ocultar resultados de autocompletado
                    handleManualSearch(); // Realizar la búsqueda manual con la sugerencia seleccionada
                });
                elements.autocompleteResults.appendChild(item);
            });
        }, 300); // Pequeño retraso para evitar llamadas excesivas
    });

    // Cerrar autocompletado al hacer clic fuera del campo de entrada
    document.addEventListener('click', (event) => {
        if (!elements.locationInput.contains(event.target) && !elements.autocompleteResults.contains(event.target)) {
            elements.autocompleteResults.innerHTML = '';
        }
    });
}

// Registrar todos los escuchadores de eventos para los botones y filtros
function registerEventListeners() {
    elements.geolocateBtn.addEventListener('click', handleGeolocation); // Botón de geolocalización
    elements.searchBtn.addEventListener('click', handleManualSearch); // Botón de búsqueda manual
    
    const filterHandler = () => {
        appState.filters.fuelType = elements.fuelTypeSelect.value;
        appState.filters.sortBy = elements.sortBySelect.value;
        appState.filters.radius = parseInt(elements.radiusSelect.value); // Convertir radio a número
        filterAndSortStations(); // Filtrar y ordenar las estaciones
        renderResults(); // Volver a renderizar los resultados

        // Actualizar localStorage con los nuevos filtros (para mantener al refrescar)
        try {
            if (appState.userLocation) { // Solo guardar si hay una ubicación activa
                localStorage.setItem('lastSearch', JSON.stringify({
                    userLocation: appState.userLocation,
                    filters: appState.filters,
                    locationName: elements.searchFeedback.textContent.replace('Mostrando resultados cerca de "', '').replace('"...', '') // Extraer nombre de ubicación
                }));
            }
        } catch (e) {
            console.warn("No se pudieron guardar los filtros en localStorage:", e);
        }
    };
    
    // Escuchadores para los cambios en los selectores de filtro
    elements.fuelTypeSelect.addEventListener('change', filterHandler);
    elements.sortBySelect.addEventListener('change', filterHandler);
    elements.radiusSelect.addEventListener('change', filterHandler);
}

// --- Manejadores de eventos y lógica principal ---

// Manejador para la geolocalización
async function handleGeolocation() {
    showLoading(true, "Detectando tu ubicación..."); // Mensaje específico
    elements.searchFeedback.style.display = 'none'; // Ocultar mensajes de feedback anteriores
    try {
        const location = await getCurrentLocation(); // Obtener la ubicación actual del usuario
        searchByCoordinates(location, 'tu ubicación actual', "Mostrando resultados cerca de tu ubicación..."); // Realizar la búsqueda por coordenadas
    } catch (error) {
        showError(error.message || error); // Mostrar mensaje de error si falla la geolocalización
    } finally {
        showLoading(false); // Ocultar indicador de carga
    }
}

// Manejador para la búsqueda manual
async function handleManualSearch() {
    const locationText = elements.locationInput.value.trim();
    if (!locationText) {
        showError('Por favor, introduce una ubicación para buscar.');
        return;
    }

    showLoading(true, `Buscando "${locationText}"...`); // Mensaje específico
    elements.searchFeedback.textContent = `Buscando "${locationText}"...`; // Este ya existe
    elements.searchFeedback.style.display = 'block';
    elements.autocompleteResults.innerHTML = ''; 
    
    try {
        const coords = await geocodeLocation(locationText); // Convertir la dirección a coordenadas
        if (coords) {
            searchByCoordinates(coords, locationText, `Mostrando resultados cerca de "${locationText}"...`); 
        } else {
            showError(`No se encontraron resultados para "${locationText}". Intenta con otro nombre.`);
        }
    } catch (error) {
        showError(error.message); // Mostrar mensaje de error si falla la geocodificación
    } finally {
        showLoading(false); 
    }
}

// Función principal para buscar y mostrar estaciones basándose en coordenadas
// Añadir un parámetro para el mensaje de feedback
function searchByCoordinates(coords, locationName, feedbackMessage = '') {
    appState.userLocation = coords; 
    elements.searchFeedback.textContent = feedbackMessage || `Mostrando resultados cerca de "${locationName}"...`; // Usar el mensaje proporcionado o el genérico
    elements.searchFeedback.style.display = 'block';
    filterAndSortStations(); 
    renderResults();

    // Guardar la última búsqueda en localStorage
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

// Filtrar y ordenar las estaciones según los filtros actuales
function filterAndSortStations() {
    if (!appState.userLocation) return; // Si no hay ubicación de usuario, no hacer nada
    
    const { fuelType, sortBy, radius } = appState.filters;

    // Calcular distancia y filtrar por radio y disponibilidad de combustible
    appState.filteredStations = appState.stations
        .map(station => ({
            ...station,
            distance: calculateDistance( // Calcular distancia de la estación al usuario
                appState.userLocation.lat, appState.userLocation.lng,
                station.lat, station.lng
            )
        }))
        .filter(station => {
            // Filtrar estaciones dentro del radio y que tengan precio para el combustible seleccionado
            return station.distance <= radius && station.prices[fuelType] !== null;
        });
    
    // Ordenar las estaciones
    appState.filteredStations.sort((a, b) => {
        if (sortBy === 'price') {
            const priceA = a.prices[fuelType];
            const priceB = b.prices[fuelType];
            if (priceA === priceB) return a.distance - b.distance; // Si los precios son iguales, ordenar por distancia
            return priceA - priceB; // Ordenar por precio (ascendente)
        }
        return a.distance - b.distance; // Ordenar por distancia (ascendente)
    });
}

// --- Renderizado y UI ---

// Renderiza los resultados de las gasolineras en la interfaz
function renderResults() {
    elements.resultsContainer.innerHTML = ''; // Limpiar resultados anteriores

    if (!appState.userLocation) {
        // Mostrar un mensaje de bienvenida/placeholder si no hay ubicación de usuario
        showPlaceholder('🗺️ Encuentra gasolineras cercanas', 'Usa tu ubicación o busca una ciudad para comenzar.');
        return;
    }
    
    if (appState.filteredStations.length === 0) {
        // Mostrar un mensaje si no se encontraron resultados después de filtrar
        const fuelName = appState.filters.fuelType === 'diesel' ? 'diésel' : 'gasolina 95';
        showPlaceholder(
            '⛽ No hay gasolineras disponibles', 
            `No se encontraron gasolineras con ${fuelName} en un radio de ${appState.filters.radius}km. Intenta **ampliar el radio de búsqueda** o probar con otra ubicación.`
        );
        return;
    }
    
    const fuelType = appState.filters.fuelType; // Combustible seleccionado actualmente
    
    appState.filteredStations.forEach((station, index) => {
        const mainPrice = station.prices[fuelType]; // Precio del combustible principal
        
        // Determinar si la tarjeta debe destacarse (es una de las 3 más baratas si se ordena por precio)
        const isCheap = appState.filters.sortBy === 'price' && index < 3;
        
        const card = document.createElement('div');
        card.className = `station-card ${isCheap ? 'station-card--featured' : ''}`;

        // Determinar qué combustible secundario mostrar
        const secondaryFuelType = fuelType === 'diesel' ? 'gasolina_95' : 'diesel';
        const secondaryFuelName = fuelType === 'diesel' ? '🚗 Gasolina 95' : '🚛 Diésel';
        const secondaryPrice = station.prices[secondaryFuelType];

        card.innerHTML = `
            <div class="station-header">
                ${isCheap ? '<div class="price-badge">💰 Precio top</div>' : ''}
                <h3 class="station-name">${escapeHTML(station.name)}</h3>
                <p class="station-address">${escapeHTML(station.address)}</p>
            </div>
            <div class="station-body">
                <div class="fuel-prices">
                    <div class="fuel-price fuel-price--primary">
                        <div class="fuel-type">${fuelType === 'diesel' ? '🚛 Diésel' : '🚗 Gasolina 95'}</div>
                        <div class="price-value">${mainPrice.toFixed(3)} €/L</div>
                    </div>
                    <div class="fuel-price fuel-price--secondary">
                        <div class="fuel-type">${secondaryFuelName}</div>
                        <div class="price-value">
                            ${secondaryPrice !== null 
                                ? `${secondaryPrice.toFixed(3)} €/L` 
                                : 'No disponible'}
                        </div>
                    </div>
                </div>
                <div class="station-footer">
                    <div class="station-info">
                        <span class="distance">📍 ${station.distance.toFixed(1)} km</span>
                        <span class="update">⏰ ${formatDate(station.lastUpdated)}</span>
                    </div>
                    <a href="https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}" target="_blank" class="map-btn" aria-label="Navegar a ${escapeHTML(station.name)} en Google Maps">
                        <span>🗺️ Navegar</span>
                    </a>
                </div>
            </div>
        `;

        elements.resultsContainer.appendChild(card);
    });
    
    // Mostrar las estadísticas de búsqueda al final de los resultados
    showSearchStats();
}

// Muestra un resumen de estadísticas de precios
function showSearchStats() {
    const fuelType = appState.filters.fuelType;
    // Filtrar precios nulos antes de calcular estadísticas
    const prices = appState.filteredStations.map(s => s.prices[fuelType]).filter(p => p !== null);
    
    if (prices.length === 0) return; // No mostrar estadísticas si no hay precios válidos
    
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    
    const statsElement = document.createElement('div');
    statsElement.className = 'search-stats';
    statsElement.innerHTML = `
        <h4>📊 Resumen de precios</h4>
        <div class="stats-grid">
            <div class="stat-item">
                <span class="stat-label">Más barato</span>
                <span class="stat-value stat-value--min">${minPrice.toFixed(3)} €</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Promedio</span>
                <span class="stat-value">${avgPrice.toFixed(3)} €</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Más caro</span>
                <span class="stat-value stat-value--max">${maxPrice.toFixed(3)} €</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Diferencia</span>
                <span class="stat-value">${(maxPrice - minPrice).toFixed(3)} €</span>
            </div>
        </div>
        <p class="stats-note">💡 Ahorra hasta <strong>${(maxPrice - minPrice).toFixed(3)} €/L</strong> eligiendo la gasolinera más barata</p>
    `;
    
    elements.resultsContainer.appendChild(statsElement);
}

// Función auxiliar para escapar HTML y prevenir ataques XSS
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

// Formatea una cadena de fecha para mostrarla de forma amigable (con Hoy/Ayer)
function formatDate(dateString) {
    if (!dateString) return 'N/D';
    try {
        // La API devuelve 'DD-MM-YYYY HH:MM:SS', necesitamos reordenarla para el constructor de Date
        const [datePart, timePart] = dateString.split(' ');
        const [day, month, year] = datePart.split('-');
        // Crear una fecha en formato YYYY-MM-DDTHH:MM:SS para que Date.parse funcione bien
        const isoDateString = `${year}-${month}-${day}T${timePart}`;
        const date = new Date(isoDateString);

        if (isNaN(date.getTime())) { // Comprobar si la fecha es inválida
            return dateString;
        }

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const stationDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

        const timeFormatted = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

        if (stationDate.getTime() === today.getTime()) {
            return `Hoy ${timeFormatted}`;
        } else if (stationDate.getTime() === yesterday.getTime()) {
            return `Ayer ${timeFormatted}`;
        } else {
            return date.toLocaleDateString('es-ES', {
                day: '2-digit', month: 'short', year: 'numeric'
            });
        }
    } catch (e) {
        console.error('Error al formatear fecha:', e);
        return dateString;
    }
}


// Muestra u oculta el indicador de carga con un mensaje opcional
function showLoading(show, message = 'Cargando...') {
    elements.loadingIndicator.style.display = show ? 'block' : 'none';
    if (show) {
        // Crear o actualizar un elemento para el mensaje de carga
        let loadingMessageElement = document.getElementById('loading-message');
        if (!loadingMessageElement) {
            loadingMessageElement = document.createElement('div');
            loadingMessageElement.id = 'loading-message';
            loadingMessageElement.className = 'loading-message'; // Clase para estilos CSS
            // Insertar después del spinner para que CSS lo posicione correctamente
            elements.loadingIndicator.parentNode.insertBefore(loadingMessageElement, elements.loadingIndicator.nextSibling); 
        }
        loadingMessageElement.textContent = message;
    } else {
        // Eliminar el mensaje cuando la carga termina
        const loadingMessageElement = document.getElementById('loading-message');
        if (loadingMessageElement) {
            loadingMessageElement.remove();
        }
    }
}

// Muestra un mensaje placeholder (sin resultados o de bienvenida)
function showPlaceholder(title, subtitle = '') {
    elements.searchFeedback.style.display = 'none'; // Ocultar feedback de búsqueda
    elements.resultsContainer.innerHTML = `
        <div class="no-results">
            <h3>${escapeHTML(title)}</h3>
            ${subtitle ? `<p>${escapeHTML(subtitle)}</p>` : ''}
            <div class="placeholder-actions">
                <button onclick="document.getElementById('geolocate-btn').click()" class="placeholder-btn" aria-label="Usar mi ubicación actual para encontrar gasolineras">
                    📍 Usar mi ubicación
                </button>
                <button onclick="document.getElementById('location-input').focus()" class="placeholder-btn" aria-label="Buscar gasolineras introduciendo una dirección manualmente">
                    🔍 Buscar manualmente
                </button>
            </div>
        </div>
    `;
}