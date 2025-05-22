// Global variables to store processed data
let kmzData = null;
let csvHpData = null;
let csvPoleData = null;
let fatBoundaries = [];
let homePassData = [];
let poleData = [];
let processedHpData = null;
let processedPoleData = null;

// Initialize event listeners when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeUploadAreas();
    initializeProgressBars();
    initializeButtons();
});

// Tab switching functionality
function switchTab(tabId) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.add('hidden');
    });
    
    // Remove active class from all tab buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab
    document.getElementById(tabId).classList.remove('hidden');
    
    // Add active class to clicked button
    event.target.classList.add('active');
    
    // Update pole tab info if KMZ is already loaded
    if (tabId === 'pole-tab' && kmzData) {
        updatePoleKmzInfo();
    }
}

// Initialize upload areas with drag and drop
function initializeUploadAreas() {
    // KMZ upload
    const kmzUpload = document.getElementById('kmz-upload');
    const kmzFile = document.getElementById('kmz-file');
    
    setupUploadArea(kmzUpload, kmzFile, handleKmzFile);
    
    // CSV HP upload
    const csvHpUpload = document.getElementById('csv-hp-upload');
    const csvHpFile = document.getElementById('csv-hp-file');
    
    setupUploadArea(csvHpUpload, csvHpFile, handleCsvHpFile);
    
    // CSV Pole upload
    const csvPoleUpload = document.getElementById('csv-pole-upload');
    const csvPoleFile = document.getElementById('csv-pole-file');
    
    setupUploadArea(csvPoleUpload, csvPoleFile, handleCsvPoleFile);
}

// Setup upload area with drag and drop functionality
function setupUploadArea(uploadArea, fileInput, handler) {
    uploadArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handler(e.target.files[0]);
        }
    });
    
    // Drag and drop events
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        
        if (e.dataTransfer.files.length > 0) {
            handler(e.dataTransfer.files[0]);
        }
    });
}

// Initialize progress bars
function initializeProgressBars() {
    window.showProgress = function(selector, show = true) {
        const progressBar = document.querySelector(selector);
        if (progressBar) {
            progressBar.classList.toggle('hidden', !show);
        }
    };
    
    window.updateProgress = function(selector, percentage, text = 'Processing...') {
        const progressBar = document.querySelector(selector);
        if (progressBar) {
            const fill = progressBar.querySelector('.progress-fill');
            const textEl = progressBar.querySelector('.progress-text');
            
            if (fill) fill.style.width = percentage + '%';
            if (textEl) textEl.textContent = text;
        }
    };
}

// Initialize button event listeners
function initializeButtons() {
    document.getElementById('process-hp-btn').addEventListener('click', processHpData);
    document.getElementById('download-hp-btn').addEventListener('click', downloadHpCsv);
    document.getElementById('process-pole-btn').addEventListener('click', processPoleData);
    document.getElementById('download-pole-btn').addEventListener('click', downloadPoleCsv);
}

// Handle KMZ file upload - REAL VERSION
async function handleKmzFile(file) {
    if (!file.name.toLowerCase().endsWith('.kmz')) {
        showAlert('error', 'File harus berformat KMZ');
        return;
    }
    
    showProgress('#kmz-progress', true);
    updateProgress('#kmz-progress', 10, 'Membaca file KMZ...');
    
    try {
        // Load JSZip library dynamically
        if (typeof JSZip === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
            document.head.appendChild(script);
            
            // Wait for JSZip to load
            await new Promise((resolve, reject) => {
                script.onload = resolve;
                script.onerror = reject;
            });
        }
        
        updateProgress('#kmz-progress', 30, 'Loading JSZip...');
        
        // Read KMZ file
        const arrayBuffer = await file.arrayBuffer();
        updateProgress('#kmz-progress', 50, 'Extracting KMZ...');
        
        // Extract KMZ with JSZip
        const zip = await JSZip.loadAsync(arrayBuffer);
        updateProgress('#kmz-progress', 70, 'Parsing KML...');
        
        // Find and extract KML file
        let kmlContent = '';
        for (const [filename, fileData] of Object.entries(zip.files)) {
            if (filename.toLowerCase().endsWith('.kml')) {
                kmlContent = await fileData.async('string');
                break;
            }
        }
        
        if (!kmlContent) {
            throw new Error('Tidak ditemukan file KML dalam KMZ');
        }
        
        updateProgress('#kmz-progress', 85, 'Processing KML data...');
        
        // Parse KML to extract data
        kmzData = parseKmlContent(kmlContent);
        
        // Extract different data types
        extractDataFromKmz();
        updateProgress('#kmz-progress', 100, 'Selesai');
        
        // Show results
        displayKmzResults();
        
        // Update pole tab if it's active
        updatePoleKmzInfo();
        
        showAlert('success', 'File KMZ berhasil diproses!');
        
    } catch (error) {
        console.error('Error processing KMZ:', error);
        showAlert('error', 'Gagal memproses file KMZ: ' + error.message);
    } finally {
        setTimeout(() => showProgress('#kmz-progress', false), 1000);
    }
}

// Parse KML content - REAL PARSER
function parseKmlContent(kmlContent) {
    // Create DOM parser
    const parser = new DOMParser();
    const doc = parser.parseFromString(kmlContent, 'text/xml');
    
    // Check for parsing errors
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
        throw new Error('Error parsing KML: ' + parseError.textContent);
    }
    
    // Extract data based on folder structure
    const result = {
        folders: {
            DISTRIBUSI: {
                HP: {
                    HOME: [],
                    HOME_BIZ: []
                },
                POLE: [],
                FDT: [],
                FAT: [],
                CABLE_DISTRIBUTION: [],
                CABLE_DROP: [],
                SLINGEWIRE: [],
                HOOK: [],
                BOUNDARY_FAT: [],
                QSPAN: []
            }
        }
    };
    
    // Get all folders
    const folders = doc.querySelectorAll('Folder');
    
    folders.forEach(folder => {
        const folderName = folder.querySelector('name')?.textContent;
        
        if (!folderName) return;
        
        // Process DISTRIBUSI folder
        if (folderName === 'DISTRIBUSI') {
            processDISTRIBUSIFolder(folder, result.folders.DISTRIBUSI);
        }
    });
    
    return result;
}

// Process DISTRIBUSI folder
function processDISTRIBUSIFolder(distribusiFolder, result) {
    const subFolders = distribusiFolder.querySelectorAll(':scope > Folder');
    
    subFolders.forEach(folder => {
        const folderName = folder.querySelector('name')?.textContent;
        
        switch(folderName) {
            case 'HP':
                processHPFolder(folder, result.HP);
                break;
            case 'POLE':
                result.POLE = extractPlacemarks(folder);
                break;
            case 'FDT':
                result.FDT = extractPlacemarks(folder);
                break;
            case 'FAT':
                result.FAT = extractPlacemarks(folder);
                break;
            case 'CABLE DISTRIBUTION':
                result.CABLE_DISTRIBUTION = extractPlacemarks(folder);
                break;
            case 'CABLE DROP':
                result.CABLE_DROP = extractPlacemarks(folder);
                break;
            case 'SLINGEWIRE':
                result.SLINGEWIRE = extractPlacemarks(folder);
                break;
            case 'HOOK':
                result.HOOK = extractPlacemarks(folder);
                break;
            case 'BOUNDARY FAT':
                result.BOUNDARY_FAT = extractPolygons(folder);
                break;
            case 'QSPAN':
                result.QSPAN = extractPlacemarks(folder);
                break;
        }
    });
}

// Process HP folder (HOME and HOME-BIZ)
function processHPFolder(hpFolder, result) {
    const subFolders = hpFolder.querySelectorAll(':scope > Folder');
    
    subFolders.forEach(folder => {
        const folderName = folder.querySelector('name')?.textContent;
        
        if (folderName === 'HOME') {
            result.HOME = extractPlacemarks(folder);
        } else if (folderName === 'HOME-BIZ') {
            result.HOME_BIZ = extractPlacemarks(folder);
        }
    });
}

// Extract placemark data from KML
function extractPlacemarks(container) {
    const placemarks = [];
    const placemarksInFolder = container.querySelectorAll('Placemark');
    
    placemarksInFolder.forEach(placemark => {
        const name = placemark.querySelector('name')?.textContent || '';
        const coordinatesEl = placemark.querySelector('Point coordinates');
        
        let coordinates = null;
        if (coordinatesEl) {
            const coordsStr = coordinatesEl.textContent.trim();
            const coords = coordsStr.split(',');
            if (coords.length >= 2) {
                coordinates = [
                    parseFloat(coords[1]), // latitude
                    parseFloat(coords[0])  // longitude
                ];
            }
        }
        
        placemarks.push({
            name: name,
            type: 'placemark',
            coordinates: coordinates
        });
    });
    
    return placemarks;
}

// Extract polygon data from KML
function extractPolygons(container) {
    const polygons = [];
    const placemarksInFolder = container.querySelectorAll('Placemark');
    
    placemarksInFolder.forEach(placemark => {
        const name = placemark.querySelector('name')?.textContent || '';
        const coordinatesEl = placemark.querySelector('Polygon LinearRing coordinates');
        
        let coordinates = [];
        if (coordinatesEl) {
            const coordsStr = coordinatesEl.textContent.trim();
            const coordPairs = coordsStr.split(' ').filter(pair => pair.trim());
            
            coordinates = coordPairs.map(pair => {
                const coords = pair.split(',');
                if (coords.length >= 2) {
                    return [
                        parseFloat(coords[1]), // latitude
                        parseFloat(coords[0])  // longitude
                    ];
                }
                return null;
            }).filter(coord => coord !== null);
        }
        
        polygons.push({
            name: name,
            type: 'polygon',
            coordinates: coordinates
        });
    });
    
    return polygons;
}

// Extract data from parsed KMZ
function extractDataFromKmz() {
    if (!kmzData) return;
    
    const dist = kmzData.folders.DISTRIBUSI;
    
    // Extract FAT boundaries
    fatBoundaries = dist.BOUNDARY_FAT || [];
    
    // Extract home pass data (HOME + HOME_BIZ)
    homePassData = [
        ...(dist.HP?.HOME || []),
        ...(dist.HP?.HOME_BIZ || [])
    ];
    
    // Extract pole data
    poleData = dist.POLE || [];
}

// Display KMZ parsing results - TAILWIND STYLE
function displayKmzResults() {
    const resultContainer = document.getElementById('kmz-result');
    
    const resultHTML = `
        <div class="bg-gray-50 dark:bg-gray-900 rounded-xl p-6 space-y-4">
            <h4 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Hasil Parsing KMZ</h4>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div class="text-center">
                    <div class="text-2xl font-bold text-blue-500">${homePassData.length}</div>
                    <div class="text-sm text-gray-600 dark:text-gray-400">HomePass</div>
                </div>
                <div class="text-center">
                    <div class="text-2xl font-bold text-green-500">${poleData.length}</div>
                    <div class="text-sm text-gray-600 dark:text-gray-400">Pole</div>
                </div>
                <div class="text-center">
                    <div class="text-2xl font-bold text-purple-500">${fatBoundaries.length}</div>
                    <div class="text-sm text-gray-600 dark:text-gray-400">FAT Boundary</div>
                </div>
                <div class="text-center">
                    <div class="text-2xl font-bold text-orange-500">${kmzData?.folders.DISTRIBUSI.FAT?.length || 0}</div>
                    <div class="text-sm text-gray-600 dark:text-gray-400">FAT</div>
                </div>
            </div>
        </div>
        <div class="mt-6 bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <h4 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Preview HomePass Data</h4>
            <div class="overflow-x-auto">
                <table class="w-full text-sm text-gray-600 dark:text-gray-400">
                    <thead class="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                        <tr>
                            <th class="px-4 py-3 text-left font-semibold">Nama</th>
                            <th class="px-4 py-3 text-left font-semibold">Type</th>
                            <th class="px-4 py-3 text-left font-semibold">Coordinates</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                        ${homePassData.slice(0, 5).map(item => `
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td class="px-4 py-3">${item.name}</td>
                                <td class="px-4 py-3">${item.type}</td>
                                <td class="px-4 py-3">${item.coordinates ? `${item.coordinates[0].toFixed(6)}, ${item.coordinates[1].toFixed(6)}` : 'N/A'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                ${homePassData.length > 5 ? `<p class="mt-4 text-sm text-gray-500 dark:text-gray-400 text-center">... dan ${homePassData.length - 5} data lainnya</p>` : ''}
            </div>
        </div>
    `;
    
    resultContainer.innerHTML = resultHTML;
}

// Show alert message - TAILWIND STYLE
function showAlert(type, message) {
    // Remove existing alerts
    const existingAlerts = document.querySelectorAll('.alert');
    existingAlerts.forEach(alert => alert.remove());
    
    // Create new alert
    const alert = document.createElement('div');
    const colors = {
        success: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200',
        error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200',
        warning: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200'
    };
    
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle'
    };
    
    alert.className = `alert alert-enter fixed top-4 right-4 max-w-sm p-4 rounded-lg border ${colors[type]} shadow-lg z-50`;
    alert.innerHTML = `
        <div class="flex items-center space-x-3">
            <i class="fas ${icons[type]} text-lg"></i>
            <span class="font-medium">${message}</span>
        </div>
    `;
    
    // Insert alert
    document.body.appendChild(alert);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (alert.parentNode) {
            alert.remove();
        }
    }, 5000);
}

// Update pole tab KMZ info - TAILWIND STYLE
function updatePoleKmzInfo() {
    const poleKmzInfo = document.getElementById('pole-kmz-info');
    
    if (kmzData && poleData.length > 0) {
        const infoHTML = `
            <div class="bg-gray-50 dark:bg-gray-900 rounded-xl p-6">
                <h4 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Data Pole dari KMZ</h4>
                <div class="text-center mb-4">
                    <div class="text-2xl font-bold text-green-500">${poleData.length}</div>
                    <div class="text-sm text-gray-600 dark:text-gray-400">Total Pole</div>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                    <h5 class="font-semibold text-gray-900 dark:text-gray-100 mb-3">Preview Pole Data</h5>
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm text-gray-600 dark:text-gray-400">
                            <thead class="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                                <tr>
                                    <th class="px-3 py-2 text-left font-semibold">Nama</th>
                                    <th class="px-3 py-2 text-left font-semibold">Type</th>
                                    <th class="px-3 py-2 text-left font-semibold">Coordinates</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                                ${poleData.slice(0, 5).map(item => `
                                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                        <td class="px-3 py-2">${item.name}</td>
                                        <td class="px-3 py-2">${item.type}</td>
                                        <td class="px-3 py-2">${item.coordinates ? `${item.coordinates[0].toFixed(6)}, ${item.coordinates[1].toFixed(6)}` : 'N/A'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                        ${poleData.length > 5 ? `<p class="mt-3 text-sm text-gray-500 dark:text-gray-400 text-center">... dan ${poleData.length - 5} data lainnya</p>` : ''}
                    </div>
                </div>
            </div>
        `;
        poleKmzInfo.innerHTML = infoHTML;
    }
}

// Handle CSV HP file upload
async function handleCsvHpFile(file) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
        showAlert('error', 'File harus berformat CSV');
        return;
    }
    
    try {
        csvHpData = await parseCSV(file);
        displayColumnMapping();
        showAlert('success', 'File CSV berhasil diupload');
        updateProcessButtonState();
    } catch (error) {
        console.error('Error parsing CSV:', error);
        showAlert('error', 'Gagal memproses file CSV: ' + error.message);
    }
}

// Handle CSV Pole file upload
async function handleCsvPoleFile(file) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
        showAlert('error', 'File harus berformat CSV');
        return;
    }
    
    try {
        csvPoleData = await parseCSV(file);
        displayPoleColumnMapping();
        showAlert('success', 'File CSV Pole berhasil diupload');
        updatePoleProcessButtonState();
    } catch (error) {
        console.error('Error parsing CSV:', error);
        showAlert('error', 'Gagal memproses file CSV Pole: ' + error.message);
    }
}

// Parse CSV file - FIXED for semicolon delimiter
async function parseCSV(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const csv = e.target.result;
                const lines = csv.split('\n');
                
                // Check if using semicolon or comma as delimiter
                const delimiter = lines[0].includes(';') ? ';' : ',';
                const headers = lines[0].split(delimiter).map(h => h.trim().replace(/"/g, ''));
                
                const data = lines.slice(1)
                    .filter(line => line.trim())
                    .map(line => {
                        const values = line.split(delimiter).map(v => v.trim().replace(/"/g, ''));
                        const row = {};
                        headers.forEach((header, index) => {
                            row[header] = values[index] || '';
                        });
                        return row;
                    });
                
                resolve({ headers, data });
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

// Display column mapping interface - ENHANCED with all columns and manual input
function displayColumnMapping() {
    if (!csvHpData) return;
    
    const mappingContainer = document.getElementById('column-mapping');
    const headers = csvHpData.headers;
    
    // Create mapping for all CSV columns
    const mappingHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <h4 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-6">Mapping Kolom CSV HomePass</h4>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">Pilih sumber data untuk setiap kolom. Kolom yang tidak diisi akan dikosongkan dalam hasil.</p>
            
            <div class="space-y-4 max-h-96 overflow-y-auto">
                ${headers.map(header => `
                    <div class="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-3">
                        <div class="flex items-center gap-3">
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 min-w-0 flex-1">
                                Kolom: <span class="text-blue-600 dark:text-blue-400 font-semibold">${header}</span>
                            </label>
                            <button 
                                onclick="toggleColumnMapping('${header}')" 
                                class="px-3 py-1 text-xs bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                            >
                                Enable
                            </button>
                        </div>
                        
                        <div id="mapping-${header}" class="hidden space-y-3">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-xs text-gray-600 dark:text-gray-400 mb-1">Sumber Data:</label>
                                    <select class="column-source w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                                            data-column="${header}" onchange="handleSourceChange('${header}')">
                                        <option value="">-- Pilih Sumber --</option>
                                        <option value="name">Nama HomePass (KMZ)</option>
                                        <option value="type">Type (KMZ)</option>
                                        <option value="cluster">Cluster Name</option>
                                        <option value="latitude">Latitude (KMZ)</option>
                                        <option value="longitude">Longitude (KMZ)</option>
                                        <option value="fat_code">FAT Code (assigned)</option>
                                        <option value="fdt_code">FDT Code (KMZ)</option>
                                        <option value="manual">Input Manual</option>
                                    </select>
                                </div>
                                <div id="manual-input-${header}" class="hidden">
                                    <label class="block text-xs text-gray-600 dark:text-gray-400 mb-1">Nilai Manual:</label>
                                    <input type="text" class="manual-value w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                                           data-column="${header}" placeholder="Masukkan nilai...">
                                </div>
                            </div>
                            <div id="preview-${header}" class="text-xs text-gray-500 dark:text-gray-400 hidden">
                                <strong>Preview:</strong> <span class="preview-value"></span>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
            
            <div class="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <h5 class="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2">Shortcut untuk Kolom Umum:</h5>
                <div class="flex flex-wrap gap-2">
                    <button onclick="autoMapColumn('HOMEPASS_ID', 'name')" class="px-3 py-1 text-xs bg-blue-500 text-white rounded-md hover:bg-blue-600">
                        HOMEPASS_ID → Nama
                    </button>
                    <button onclick="autoMapColumn('HOUSE_NUMBER', 'name')" class="px-3 py-1 text-xs bg-blue-500 text-white rounded-md hover:bg-blue-600">
                        HOUSE_NUMBER → Nama
                    </button>
                    <button onclick="autoMapColumn('BUILDING_LATITUDE', 'latitude')" class="px-3 py-1 text-xs bg-blue-500 text-white rounded-md hover:bg-blue-600">
                        BUILDING_LATITUDE → Latitude
                    </button>
                    <button onclick="autoMapColumn('BUILDING_LONGITUDE', 'longitude')" class="px-3 py-1 text-xs bg-blue-500 text-white rounded-md hover:bg-blue-600">
                        BUILDING_LONGITUDE → Longitude
                    </button>
                    <button onclick="autoMapColumn('FAT_CODE', 'fat_code')" class="px-3 py-1 text-xs bg-blue-500 text-white rounded-md hover:bg-blue-600">
                        FAT_CODE → FAT Assignment
                    </button>
                    <button onclick="autoMapColumn('FDT_CODE', 'fdt_code')" class="px-3 py-1 text-xs bg-blue-500 text-white rounded-md hover:bg-blue-600">
                        FDT_CODE → FDT Name
                    </button>
                </div>
            </div>
        </div>
        
        <div class="mt-6 bg-gray-50 dark:bg-gray-900 rounded-xl p-6">
            <h4 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Preview CSV Data</h4>
            <div class="overflow-x-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <table class="w-full text-sm text-gray-600 dark:text-gray-400">
                    <thead class="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                        <tr>
                            ${headers.slice(0, 8).map(header => `<th class="px-4 py-3 text-left font-semibold">${header}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                        ${csvHpData.data.slice(0, 3).map(row => `
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                ${headers.slice(0, 8).map(header => `<td class="px-4 py-3">${row[header] || ''}</td>`).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                ${headers.length > 8 ? `<p class="mt-4 text-sm text-gray-500 dark:text-gray-400 text-center">... dan ${headers.length - 8} kolom lainnya</p>` : ''}
            </div>
        </div>
    `;
    
    mappingContainer.innerHTML = mappingHTML;
}

// Display pole column mapping interface - ENHANCED with all columns
function displayPoleColumnMapping() {
    if (!csvPoleData) return;
    
    const mappingContainer = document.getElementById('pole-column-mapping');
    const headers = csvPoleData.headers;
    
    // Create mapping for all CSV columns
    const mappingHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <h4 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-6">Mapping Kolom CSV Pole</h4>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">Pilih sumber data untuk setiap kolom. Kolom yang tidak diisi akan dikosongkan dalam hasil.</p>
            
            <div class="space-y-4 max-h-96 overflow-y-auto">
                ${headers.map(header => `
                    <div class="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-3">
                        <div class="flex items-center gap-3">
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 min-w-0 flex-1">
                                Kolom: <span class="text-green-600 dark:text-green-400 font-semibold">${header}</span>
                            </label>
                            <button 
                                onclick="togglePoleColumnMapping('${header}')" 
                                class="px-3 py-1 text-xs bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
                            >
                                Enable
                            </button>
                        </div>
                        
                        <div id="pole-mapping-${header}" class="hidden space-y-3">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-xs text-gray-600 dark:text-gray-400 mb-1">Sumber Data:</label>
                                    <select class="pole-column-source w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-green-500" 
                                            data-column="${header}" onchange="handlePoleSourceChange('${header}')">
                                        <option value="">-- Pilih Sumber --</option>
                                        <option value="name">Nama Pole (KMZ)</option>
                                        <option value="type">Type (KMZ)</option>
                                        <option value="latitude">Latitude (KMZ)</option>
                                        <option value="longitude">Longitude (KMZ)</option>
                                        <option value="manual">Input Manual</option>
                                    </select>
                                </div>
                                <div id="pole-manual-input-${header}" class="hidden">
                                    <label class="block text-xs text-gray-600 dark:text-gray-400 mb-1">Nilai Manual:</label>
                                    <input type="text" class="pole-manual-value w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-green-500" 
                                           data-column="${header}" placeholder="Masukkan nilai...">
                                </div>
                            </div>
                            <div id="pole-preview-${header}" class="text-xs text-gray-500 dark:text-gray-400 hidden">
                                <strong>Preview:</strong> <span class="preview-value"></span>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
            
            <div class="mt-6 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <h5 class="text-sm font-semibold text-green-800 dark:text-green-200 mb-2">Shortcut untuk Kolom Umum:</h5>
                <div class="flex flex-wrap gap-2">
                    <button onclick="autoMapPoleColumn('POLE_ID', 'name')" class="px-3 py-1 text-xs bg-green-500 text-white rounded-md hover:bg-green-600">
                        POLE_ID → Nama
                    </button>
                    <button onclick="autoMapPoleColumn('Coordinate (Lat) NEW', 'latitude')" class="px-3 py-1 text-xs bg-green-500 text-white rounded-md hover:bg-green-600">
                        Latitude Column → Latitude
                    </button>
                    <button onclick="autoMapPoleColumn('Coordinate (Long) NEW', 'longitude')" class="px-3 py-1 text-xs bg-green-500 text-white rounded-md hover:bg-green-600">
                        Longitude Column → Longitude
                    </button>
                    <button onclick="autoMapPoleColumn('Pole Provider (New)', 'manual', 'NEW')" class="px-3 py-1 text-xs bg-green-500 text-white rounded-md hover:bg-green-600">
                        Provider → "NEW"
                    </button>
                </div>
            </div>
        </div>
        
        <div class="mt-6 bg-gray-50 dark:bg-gray-900 rounded-xl p-6">
            <h4 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Preview CSV Pole Data</h4>
            <div class="overflow-x-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <table class="w-full text-sm text-gray-600 dark:text-gray-400">
                    <thead class="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                        <tr>
                            ${headers.map(header => `<th class="px-4 py-3 text-left font-semibold">${header}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                        ${csvPoleData.data.slice(0, 3).map(row => `
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                ${headers.map(header => `<td class="px-4 py-3">${row[header] || ''}</td>`).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    mappingContainer.innerHTML = mappingHTML;
}

// Helper functions for column mapping
function toggleColumnMapping(column) {
    const mappingDiv = document.getElementById(`mapping-${column}`);
    const button = event.target;
    
    if (mappingDiv.classList.contains('hidden')) {
        mappingDiv.classList.remove('hidden');
        button.textContent = 'Disable';
        button.classList.remove('bg-blue-500', 'hover:bg-blue-600');
        button.classList.add('bg-red-500', 'hover:bg-red-600');
    } else {
        mappingDiv.classList.add('hidden');
        button.textContent = 'Enable';
        button.classList.remove('bg-red-500', 'hover:bg-red-600');
        button.classList.add('bg-blue-500', 'hover:bg-blue-600');
    }
    
    updateProcessButtonState();
}

function togglePoleColumnMapping(column) {
    const mappingDiv = document.getElementById(`pole-mapping-${column}`);
    const button = event.target;
    
    if (mappingDiv.classList.contains('hidden')) {
        mappingDiv.classList.remove('hidden');
        button.textContent = 'Disable';
        button.classList.remove('bg-green-500', 'hover:bg-green-600');
        button.classList.add('bg-red-500', 'hover:bg-red-600');
    } else {
        mappingDiv.classList.add('hidden');
        button.textContent = 'Enable';
        button.classList.remove('bg-red-500', 'hover:bg-red-600');
        button.classList.add('bg-green-500', 'hover:bg-green-600');
    }
    
    updatePoleProcessButtonState();
}

function handleSourceChange(column) {
    const sourceSelect = document.querySelector(`select[data-column="${column}"]`);
    const manualInput = document.getElementById(`manual-input-${column}`);
    const preview = document.getElementById(`preview-${column}`);
    
    if (sourceSelect.value === 'manual') {
        manualInput.classList.remove('hidden');
        preview.classList.add('hidden');
    } else {
        manualInput.classList.add('hidden');
        if (sourceSelect.value) {
            preview.classList.remove('hidden');
            updatePreview(column, sourceSelect.value);
        } else {
            preview.classList.add('hidden');
        }
    }
    
    updateProcessButtonState();
}

function handlePoleSourceChange(column) {
    const sourceSelect = document.querySelector(`select.pole-column-source[data-column="${column}"]`);
    const manualInput = document.getElementById(`pole-manual-input-${column}`);
    const preview = document.getElementById(`pole-preview-${column}`);
    
    if (sourceSelect.value === 'manual') {
        manualInput.classList.remove('hidden');
        preview.classList.add('hidden');
    } else {
        manualInput.classList.add('hidden');
        if (sourceSelect.value) {
            preview.classList.remove('hidden');
            updatePolePreview(column, sourceSelect.value);
        } else {
            preview.classList.add('hidden');
        }
    }
    
    updatePoleProcessButtonState();
}

function updatePreview(column, source) {
    const preview = document.querySelector(`#preview-${column} .preview-value`);
    let value = '';
    
    if (homePassData.length > 0) {
        const firstItem = homePassData[0];
        switch (source) {
            case 'name':
                value = firstItem.name || 'N/A';
                break;
            case 'type':
                value = firstItem.type || 'N/A';
                break;
            case 'cluster':
                value = extractClusterFromName(firstItem.name) || 'N/A';
                break;
            case 'latitude':
                value = firstItem.coordinates ? firstItem.coordinates[0].toFixed(6) : 'N/A';
                break;
            case 'longitude':
                value = firstItem.coordinates ? firstItem.coordinates[1].toFixed(6) : 'N/A';
                break;
            case 'fat_code':
                value = fatBoundaries.length > 0 ? fatBoundaries[0].name : 'N/A';
                break;
            case 'fdt_code':
                value = kmzData?.folders.DISTRIBUSI.FDT?.[0]?.name || 'FRL0210';
                break;
        }
    }
    
    preview.textContent = value;
}

function updatePolePreview(column, source) {
    const preview = document.querySelector(`#pole-preview-${column} .preview-value`);
    let value = '';
    
    if (poleData.length > 0) {
        const firstItem = poleData[0];
        switch (source) {
            case 'name':
                value = firstItem.name || 'N/A';
                break;
            case 'type':
                value = firstItem.type || 'N/A';
                break;
            case 'latitude':
                value = firstItem.coordinates ? firstItem.coordinates[0].toFixed(6) : 'N/A';
                break;
            case 'longitude':
                value = firstItem.coordinates ? firstItem.coordinates[1].toFixed(6) : 'N/A';
                break;
        }
    }
    
    preview.textContent = value;
}

function autoMapColumn(columnName, source) {
    const columnDiv = document.getElementById(`mapping-${columnName}`);
    if (columnDiv) {
        // Enable the column mapping if it's disabled
        if (columnDiv.classList.contains('hidden')) {
            toggleColumnMapping(columnName);
        }
        
        // Set the source
        const sourceSelect = document.querySelector(`select[data-column="${columnName}"]`);
        if (sourceSelect) {
            sourceSelect.value = source;
            handleSourceChange(columnName);
        }
    }
}

function autoMapPoleColumn(columnName, source, manualValue = '') {
    const columnDiv = document.getElementById(`pole-mapping-${columnName}`);
    if (columnDiv) {
        // Enable the column mapping if it's disabled
        if (columnDiv.classList.contains('hidden')) {
            togglePoleColumnMapping(columnName);
        }
        
        // Set the source
        const sourceSelect = document.querySelector(`select.pole-column-source[data-column="${columnName}"]`);
        if (sourceSelect) {
            sourceSelect.value = source;
            handlePoleSourceChange(columnName);
            
            // If manual value provided, set it
            if (source === 'manual' && manualValue) {
                const manualInput = document.querySelector(`input.pole-manual-value[data-column="${columnName}"]`);
                if (manualInput) {
                    manualInput.value = manualValue;
                }
            }
        }
    }
}

// Extract cluster name from home pass name
function extractClusterFromName(name) {
    // Extract cluster from name like "rumah-1" -> "rumah"
    const parts = name.split('-');
    return parts[0] || name;
}

// Group home pass by FAT boundaries
function groupHomePassByFat() {
    const grouped = {};
    
    // Initialize groups for each FAT
    fatBoundaries.forEach(fat => {
        grouped[fat.name] = [];
    });
    
    // Assign each home pass to appropriate FAT based on coordinates
    homePassData.forEach(homePass => {
        let assigned = false;
        
        for (const fat of fatBoundaries) {
            if (isPointInPolygon(homePass.coordinates, fat.coordinates)) {
                grouped[fat.name].push(homePass);
                assigned = true;
                break;
            }
        }
        
        // If not assigned, add to first FAT as fallback
        if (!assigned && fatBoundaries.length > 0) {
            grouped[fatBoundaries[0].name].push(homePass);
        }
    });
    
    return grouped;
}

// Check if point is inside polygon using ray casting algorithm
function isPointInPolygon(point, polygon) {
    if (!point || !polygon || polygon.length < 3) return false;
    
    const x = point[1]; // longitude
    const y = point[0]; // latitude
    let inside = false;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][1], yi = polygon[i][0];
        const xj = polygon[j][1], yj = polygon[j][0];
        
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    
    return inside;
}

// Updated process HP data to handle all column mappings
async function processHpData() {
    if (!kmzData || !csvHpData) {
        showAlert('error', 'Pastikan KMZ dan CSV sudah diupload');
        return;
    }
    
    try {
        // Group home pass by FAT boundaries first
        const groupedByFat = groupHomePassByFat();
        
        // Get FDT name from KMZ
        const fdtName = kmzData.folders.DISTRIBUSI.FDT && kmzData.folders.DISTRIBUSI.FDT.length > 0 
            ? kmzData.folders.DISTRIBUSI.FDT[0].name 
            : 'FRL0210';
        
        // Create processed data
        processedHpData = [];
        
        // Sort FAT order for consistent output
        const fatOrder = Object.keys(groupedByFat).sort();
        
        fatOrder.forEach(fatName => {
            const group = groupedByFat[fatName] || [];
            group.forEach((homePass, index) => {
                const newRow = {};
                
                // Initialize all columns with empty values
                csvHpData.headers.forEach(header => {
                    newRow[header] = '';
                });
                
                // Process each column mapping
                csvHpData.headers.forEach(header => {
                    const mappingDiv = document.getElementById(`mapping-${header}`);
                    if (mappingDiv && !mappingDiv.classList.contains('hidden')) {
                        const sourceSelect = document.querySelector(`select[data-column="${header}"]`);
                        const manualInput = document.querySelector(`input[data-column="${header}"]`);
                        
                        if (sourceSelect && sourceSelect.value) {
                            if (sourceSelect.value === 'manual' && manualInput) {
                                newRow[header] = manualInput.value || '';
                            } else {
                                // Map from KMZ data
                                switch (sourceSelect.value) {
                                    case 'name':
                                        newRow[header] = homePass.name || '';
                                        break;
                                    case 'type':
                                        newRow[header] = homePass.type || '';
                                        break;
                                    case 'cluster':
                                        newRow[header] = extractClusterFromName(homePass.name) || '';
                                        break;
                                    case 'latitude':
                                        newRow[header] = homePass.coordinates ? homePass.coordinates[0] : '';
                                        break;
                                    case 'longitude':
                                        newRow[header] = homePass.coordinates ? homePass.coordinates[1] : '';
                                        break;
                                    case 'fat_code':
                                        newRow[header] = fatName;
                                        break;
                                    case 'fdt_code':
                                        newRow[header] = fdtName;
                                        break;
                                }
                            }
                        }
                    }
                });
                
                processedHpData.push(newRow);
            });
        });
        
        // Show results
        displayHpResults();
        
        // Enable download button
        document.getElementById('download-hp-btn').disabled = false;
        
        showAlert('success', `Data berhasil diproses! ${processedHpData.length} HomePass ready untuk download`);
        
    } catch (error) {
        console.error('Error processing HP data:', error);
        showAlert('error', 'Gagal memproses data: ' + error.message);
    }
}

// Process Pole data - ENHANCED with all columns
async function processPoleData() {
    if (!kmzData || !csvPoleData) {
        showAlert('error', 'Pastikan KMZ dan CSV Pole sudah diupload');
        return;
    }
    
    try {
        // Create processed data
        processedPoleData = [];
        
        poleData.forEach(pole => {
            const newRow = {};
            
            // Initialize all columns with empty values
            csvPoleData.headers.forEach(header => {
                newRow[header] = '';
            });
            
            // Process each column mapping
            csvPoleData.headers.forEach(header => {
                const mappingDiv = document.getElementById(`pole-mapping-${header}`);
                if (mappingDiv && !mappingDiv.classList.contains('hidden')) {
                    const sourceSelect = document.querySelector(`.pole-column-source[data-column="${header}"]`);
                    const manualInput = document.querySelector(`.pole-manual-value[data-column="${header}"]`);
                    
                    if (sourceSelect && sourceSelect.value) {
                        if (sourceSelect.value === 'manual' && manualInput) {
                            newRow[header] = manualInput.value || '';
                        } else {
                            // Map from KMZ data
                            switch (sourceSelect.value) {
                                case 'name':
                                    newRow[header] = pole.name || '';
                                    break;
                                case 'type':
                                    newRow[header] = pole.type || '';
                                    break;
                                case 'latitude':
                                    newRow[header] = pole.coordinates ? pole.coordinates[0] : '';
                                    break;
                                case 'longitude':
                                    newRow[header] = pole.coordinates ? pole.coordinates[1] : '';
                                    break;
                            }
                        }
                    }
                }
            });
            
            processedPoleData.push(newRow);
        });
        
        // Show results
        displayPoleResults();
        
        // Enable download button
        document.getElementById('download-pole-btn').disabled = false;
        
        showAlert('success', `Data Pole berhasil diproses! ${processedPoleData.length} Pole ready untuk download`);
        
    } catch (error) {
        console.error('Error processing Pole data:', error);
        showAlert('error', 'Gagal memproses data Pole: ' + error.message);
    }
}

// Display HP processing results - TAILWIND STYLE
function displayHpResults() {
    const resultContainer = document.getElementById('hp-result');
    
    if (!processedHpData || processedHpData.length === 0) {
        resultContainer.innerHTML = '<p class="text-gray-500 dark:text-gray-400 italic text-center mt-8">Belum ada data yang diproses</p>';
        return;
    }
    
    const headers = Object.keys(processedHpData[0]);
    
    const resultHTML = `
        <div class="bg-gray-50 dark:bg-gray-900 rounded-xl p-6 space-y-4">
            <h4 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Hasil Processing HomePass</h4>
            <div class="grid grid-cols-2 gap-4">
                <div class="text-center">
                    <div class="text-2xl font-bold text-blue-500">${processedHpData.length}</div>
                    <div class="text-sm text-gray-600 dark:text-gray-400">Total Data</div>
                </div>
                <div class="text-center">
                    <div class="text-2xl font-bold text-green-500">${headers.length}</div>
                    <div class="text-sm text-gray-600 dark:text-gray-400">Kolom</div>
                </div>
            </div>
        </div>
        <div class="mt-6 bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <h4 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Preview Hasil</h4>
            <div class="overflow-x-auto">
                <table class="w-full text-sm text-gray-600 dark:text-gray-400">
                    <thead class="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                        <tr>
                            ${headers.map(header => `<th class="px-4 py-3 text-left font-semibold">${header}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                        ${processedHpData.slice(0, 5).map(row => `
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                ${headers.map(header => `<td class="px-4 py-3">${row[header] || ''}</td>`).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                ${processedHpData.length > 5 ? `<p class="mt-4 text-sm text-gray-500 dark:text-gray-400 text-center">... dan ${processedHpData.length - 5} data lainnya</p>` : ''}
            </div>
        </div>
    `;
    
    resultContainer.innerHTML = resultHTML;
}

// Display Pole processing results - TAILWIND STYLE
function displayPoleResults() {
    const resultContainer = document.getElementById('pole-result');
    
    if (!processedPoleData || processedPoleData.length === 0) {
        resultContainer.innerHTML = '<p class="text-gray-500 dark:text-gray-400 italic text-center mt-8">Belum ada data yang diproses</p>';
        return;
    }
    
    const headers = Object.keys(processedPoleData[0]);
    
    const resultHTML = `
        <div class="bg-gray-50 dark:bg-gray-900 rounded-xl p-6 space-y-4">
            <h4 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Hasil Processing Pole</h4>
            <div class="grid grid-cols-2 gap-4">
                <div class="text-center">
                    <div class="text-2xl font-bold text-green-500">${processedPoleData.length}</div>
                    <div class="text-sm text-gray-600 dark:text-gray-400">Total Data</div>
                </div>
                <div class="text-center">
                    <div class="text-2xl font-bold text-blue-500">${headers.length}</div>
                    <div class="text-sm text-gray-600 dark:text-gray-400">Kolom</div>
                </div>
            </div>
        </div>
        <div class="mt-6 bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <h4 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Preview Hasil</h4>
            <div class="overflow-x-auto">
                <table class="w-full text-sm text-gray-600 dark:text-gray-400">
                    <thead class="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                        <tr>
                            ${headers.map(header => `<th class="px-4 py-3 text-left font-semibold">${header}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                        ${processedPoleData.slice(0, 5).map(row => `
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                ${headers.map(header => `<td class="px-4 py-3">${row[header] || ''}</td>`).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                ${processedPoleData.length > 5 ? `<p class="mt-4 text-sm text-gray-500 dark:text-gray-400 text-center">... dan ${processedPoleData.length - 5} data lainnya</p>` : ''}
            </div>
        </div>
    `;
    
    resultContainer.innerHTML = resultHTML;
}

// Update process button state
function updateProcessButtonState() {
    const processBtn = document.getElementById('process-hp-btn');
    
    // Check if at least one column is mapped
    let hasMapping = false;
    if (csvHpData) {
        csvHpData.headers.forEach(header => {
            const mappingDiv = document.getElementById(`mapping-${header}`);
            if (mappingDiv && !mappingDiv.classList.contains('hidden')) {
                hasMapping = true;
            }
        });
    }
    
    const isReady = kmzData && csvHpData && hasMapping;
    
    if (processBtn) {
        processBtn.disabled = !isReady;
    }
}

// Update pole process button state
function updatePoleProcessButtonState() {
    const processBtn = document.getElementById('process-pole-btn');
    
    // Check if at least one column is mapped
    let hasMapping = false;
    if (csvPoleData) {
        csvPoleData.headers.forEach(header => {
            const mappingDiv = document.getElementById(`pole-mapping-${header}`);
            if (mappingDiv && !mappingDiv.classList.contains('hidden')) {
                hasMapping = true;
            }
        });
    }
    
    const isReady = kmzData && csvPoleData && hasMapping;
    
    if (processBtn) {
        processBtn.disabled = !isReady;
    }
}

// Download HP CSV - FIXED to use semicolon delimiter
function downloadHpCsv() {
    if (!processedHpData || processedHpData.length === 0) {
        showAlert('error', 'Belum ada data HP yang diproses');
        return;
    }
    
    // Convert to CSV with semicolon delimiter
    const headers = Object.keys(processedHpData[0]);
    const csvContent = [
        headers.join(';'),
        ...processedHpData.map(row => 
            headers.map(header => `"${row[header] || ''}"`).join(';')
        )
    ].join('\n');
    
    // Download file
    downloadFile(csvContent, 'processed_homepass.csv', 'text/csv');
    showAlert('success', 'File CSV HomePass berhasil didownload!');
}

// Download Pole CSV - FIXED to use semicolon delimiter
function downloadPoleCsv() {
    if (!processedPoleData || processedPoleData.length === 0) {
        showAlert('error', 'Belum ada data Pole yang diproses');
        return;
    }
    
    // Convert to CSV with semicolon delimiter
    const headers = Object.keys(processedPoleData[0]);
    const csvContent = [
        headers.join(';'),
        ...processedPoleData.map(row => 
            headers.map(header => `"${row[header] || ''}"`).join(';')
        )
    ].join('\n');
    
    // Download file
    downloadFile(csvContent, 'processed_pole.csv', 'text/csv');
    showAlert('success', 'File CSV Pole berhasil didownload!');
}

// Generic download file function
function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    
    URL.revokeObjectURL(url);
}