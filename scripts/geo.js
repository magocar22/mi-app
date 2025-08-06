// scripts/geo.js
// Obtener ubicación actual
export function getCurrentLocation() {
    return new Promise((resolve, reject) => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                position => resolve({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                }),
                error => reject(`Error geolocalización: ${error.message}`)
            );
        } else {
            reject('Geolocalización no soportada por tu navegador');
        }
    });
}

// Calcular distancia entre coordenadas (Haversine)
export function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radio de la Tierra en km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c;
}

function deg2rad(deg) {
    return deg * (Math.PI/180);
}

// Coordenadas de ciudades principales
export const cityCoordinates = {
    madrid: { lat: 40.4168, lng: -3.7038 },
    barcelona: { lat: 41.3851, lng: 2.1734 },
    valencia: { lat: 39.4699, lng: -0.3763 },
    sevilla: { lat: 37.3891, lng: -5.9845 },
    bilbao: { lat: 43.2630, lng: -2.9350 }
};