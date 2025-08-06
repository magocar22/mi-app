// scripts/api.js - Versión corregida
export async function fetchFuelStations() {
    const API_URL = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/';
    
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('Error en la API: ' + response.status);
        
        const data = await response.json();
        
        return transformAPIData(data);
    } catch (error) {
        console.error('Error fetching fuel data:', error);
        throw new Error('No se pudieron obtener los datos de las gasolineras. Por favor, inténtalo de nuevo más tarde.');
    }
}

function transformAPIData(apiData) {
    if (!apiData.ListaEESSPrecio) {
        throw new Error('No se encontraron datos de gasolineras en la respuesta');
    }
    
    return apiData.ListaEESSPrecio
        .map(station => {
            try {
                // Validar datos esenciales: ID y coordenadas
                if (!station['IDEESS']) {
                    console.warn('Gasolinera sin ID, saltando:', station);
                    return null;
                }
                
                const stationName = getStationName(station);
                const coordinates = getCoordinates(station);
                if (!coordinates) {
                    console.warn('Gasolinera sin coordenadas válidas, saltando:', station);
                    return null;
                }
                
                return {
                    id: station['IDEESS'],
                    name: stationName,
                    address: formatAddress(station),
                    lat: coordinates.lat,
                    lng: coordinates.lng,
                    prices: {
                        diesel: parsePrice(station['Precio Gasoleo A']),
                        gasolina_95: parsePrice(station['Precio Gasolina 95 E5'])

                    },
                    lastUpdated: station['Fecha'] || new Date().toISOString().split('T')[0]
                };
            } catch (error) {
                console.warn('Error procesando gasolinera:', station, error);
                return null;
            }
        })
        .filter(station => station !== null);
}

function getStationName(station) {
    const nameFields = [
        'Rotulo', 'Rótulo', 'Nombre', 'Marca', 
        'Razón Social', 'RazonSocial', 'Operadora', 'Franquicia'
    ];
    
    for (const field of nameFields) {
        const value = station[field];
        if (value && typeof value === 'string') {
            const cleanName = value.trim();
            if (cleanName && cleanName !== '' && cleanName.toLowerCase() !== 'null') {
                return cleanName;
            }
        }
    }
    
    // Intentar con la dirección
    const address = station['Direccion'] || station['Dirección'];
    if (address && typeof address === 'string') {
        const cleanAddress = address.trim();
        if (cleanAddress) {
            return `Gasolinera - ${cleanAddress.substring(0, 30)}${cleanAddress.length > 30 ? '...' : ''}`;
        }
    }
    
    return `Gasolinera #${station['IDEESS']}`;
}

function getCoordinates(station) {
    const latFields = ['Latitud', 'Latitude', 'lat'];
    const lngFields = ['Longitud (WGS84)', 'Longitude', 'lng', 'lon', 'Longitud'];
    
    let lat = null;
    let lng = null;
    
    for (const field of latFields) {
        const value = station[field];
        if (value !== undefined && value !== null && value !== '') {
            const parsed = parseFloat(String(value).replace(',', '.'));
            if (!isNaN(parsed) && parsed >= 35 && parsed <= 45) {
                lat = parsed;
                break;
            }
        }
    }
    
    for (const field of lngFields) {
        const value = station[field];
        if (value !== undefined && value !== null && value !== '') {
            const parsed = parseFloat(String(value).replace(',', '.'));
            if (!isNaN(parsed) && parsed >= -10 && parsed <= 5) {
                lng = parsed;
                break;
            }
        }
    }
    
    return (lat && lng) ? { lat, lng } : null;
}

function formatAddress(station) {
    const addressFields = ['Direccion', 'Dirección', 'Address'];
    const postalFields = ['C.P.', 'CP', 'CodigoPostal', 'Codigo Postal'];
    const cityFields = ['Localidad', 'Municipio', 'Ciudad'];
    const provinceFields = ['Provincia', 'Province'];
    
    const address = getFieldValue(station, addressFields);
    const postal = getFieldValue(station, postalFields);
    const city = getFieldValue(station, cityFields);
    const province = getFieldValue(station, provinceFields);
    
    const parts = [address, postal, city, province].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'Dirección no disponible';
}

function getFieldValue(station, fields) {
    for (const field of fields) {
        const value = station[field];
        if (value && typeof value === 'string') {
            const cleaned = value.trim();
            if (cleaned && cleaned.toLowerCase() !== 'null') {
                return cleaned;
            }
        }
    }
    return null;
}

function parsePrice(priceString) {
    if (!priceString || priceString === '' || priceString === 'null') {
        return null;
    }
    
    const cleanString = String(priceString)
        .trim()
        .replace(',', '.')
        .replace(/[^\d.-]/g, '');
    
    if (cleanString === '' || cleanString === '-' || cleanString === '.') {
        return null;
    }
    
    const price = parseFloat(cleanString);
    
    if (isNaN(price) || price < 0.5 || price > 3.0) {
        return null;
    }
    
    return price;
}

export async function getMunicipalities() {
    try {
        const response = await fetch('https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/Listados/Municipios/');
        const data = await response.json();
        return data
            .map(m => m['Municipio'])
            .filter(Boolean)
            .filter(name => name.toLowerCase() !== 'null');
    } catch (error) {
        console.error('Error fetching municipalities:', error);
        return [];
    }
}