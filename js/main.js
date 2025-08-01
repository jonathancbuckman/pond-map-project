// --- 1. INITIALIZE THE MAP ---
const map = L.map('map', {
  zoomControl: true
}).setView([35.5, -98.5], 7);

// --- 2. DEFINE BASEMAP LAYERS ---
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}); // <-- FIXED

const hybridMap = L.layerGroup([
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }),
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, pane: 'shadowPane' })
]);

// Counties overlay pane (between basemaps and ponds)
map.createPane('countiesPane');
map.getPane('countiesPane').style.zIndex = '350'; // below default overlayPane (~400) so ponds remain above
map.getPane('countiesPane').style.pointerEvents = 'none'; // do not block pond clicks

// PLSS panes (between basemaps and ponds; labels non-interactive)
map.createPane('plssTownshipsPane');
map.getPane('plssTownshipsPane').style.zIndex = '350';
map.getPane('plssTownshipsPane').style.pointerEvents = 'none';
map.createPane('plssLabelsPane');
map.getPane('plssLabelsPane').style.zIndex = '360';
map.getPane('plssLabelsPane').style.pointerEvents = 'none';
 
// Labels pane above counties but still below ponds for clarity
map.createPane('labelsPane');
map.getPane('labelsPane').style.zIndex = '360';
map.getPane('labelsPane').style.pointerEvents = 'none'; // labels should not intercept clicks
 
// Create a dedicated, high-level pane for ponds so they render above everything
map.createPane('pondsPane');
map.getPane('pondsPane').style.zIndex = 650;

// Load faint Oklahoma counties overlay
const countiesOverlay = L.layerGroup();
const countiesLabels = L.layerGroup();

// PLSS overlays (townships/range and sections via local GeoJSON)
const plssTownshipsOverlay = L.layerGroup();
const plssTownshipLabels = L.layerGroup();

// Local sections layers (lines and simple labels)
const plssSectionsOverlay = L.layerGroup();
const plssSectionLabelsOverlay = L.layerGroup();

fetch('data/ok_counties.geojson')
  .then(r => r.ok ? r.json() : Promise.reject(new Error('Counties file not found')))
  .then(gj => {
    // Counties outlines
    L.geoJSON(gj, {
      pane: 'countiesPane',
      interactive: false,
      style: {
        color: '#aaaaaa',   // faint gray outline
        weight: 1,
        opacity: 0.6,
        fillColor: '#000000',
        fillOpacity: 0.0    // no fill, outlines only
      }
    }).addTo(countiesOverlay);

    // County labels (NAME attribute)
    const labelStyle = 'color:#555;font-size:12px;line-height:12px;background:transparent;border:none;text-shadow:0 0 2px #fff, 0 0 4px #fff;';
    const labelIcon = (text) => L.divIcon({
      className: 'county-label',
      html: `<span style="${labelStyle}">${text}</span>`,
      iconSize: [1, 1]
    });

    // Compute interior points (fallback to centroid)
    function featureCenter(feature, layer) {
      if (layer && layer.getBounds) return layer.getBounds().getCenter();
      const geom = feature.geometry;
      const coords = geom.type === 'Polygon' ? geom.coordinates[0] :
                     geom.type === 'MultiPolygon' ? geom.coordinates[0][0] : null;
      if (!coords) return null;
      let x = 0, y = 0;
      coords.forEach(c => { x += c[0]; y += c[1]; });
      const n = coords.length || 1;
      return L.latLng(y / n, x / n);
    }

    L.geoJSON(gj, {
      pane: 'labelsPane',
      interactive: false,
      onEachFeature: (feature, layer) => {
        const name = (feature.properties && (feature.properties.NAME || feature.properties.NAME_ALT)) || '';
        if (!name) return;
        const center = featureCenter(feature, layer);
        if (!center) return;
        L.marker(center, { icon: labelIcon(name), pane: 'labelsPane', interactive: false }).addTo(countiesLabels);
      },
      style: () => ({ opacity: 0 })
    });
  })
  .catch(err => console.warn('Counties overlay not loaded:', err));

// --- PLSS Townships/Range ---
fetch('data/plss_townships.geojson')
  .then(r => r.ok ? r.json() : Promise.reject(new Error('PLSS townships file not found')))
  .then(gj => {
    // Grid lines
    L.geoJSON(gj, {
      pane: 'plssTownshipsPane',
      interactive: false,
      style: {
        color: '#ff6600',    // Bright orange color
        weight: 2,           // Slightly thicker lines
        opacity: 1.0,        // Full opacity for better visibility
        fillOpacity: 0
      }
    }).addTo(plssTownshipsOverlay);

    // Township labels (simple label: Txx? Ryy? if present; otherwise no label)
    const tLabel = (props) => {
      const tn = (props.TWNSHPNO ?? '').toString().replace(/^0+/, '');
      const td = (props.TWNSHPDIR ?? '').toString().toUpperCase().replace(/[^NS]/g, '');
      const rn = (props.RANGENO ?? '').toString().replace(/^0+/, '');
      const rd = (props.RANGEDIR ?? '').toString().toUpperCase().replace(/[^EW]/g, '');
      return (tn && td && rn && rd) ? `T${tn}${td} R${rn}${rd}` : '';
    };
    const tLabelStyle = 'color:#555;font-size:11px;line-height:11px;background:transparent;border:none;text-shadow:0 0 2px #fff, 0 0 4px #fff;';
    const tLabelIcon = (text) => L.divIcon({ className: 'plss-label', html: `<span style="${tLabelStyle}">${text}</span>`, iconSize: [1,1] });

    L.geoJSON(gj, {
      pane: 'plssLabelsPane',
      interactive: false,
      onEachFeature: (feature, layer) => {
        const props = feature.properties || {};
        const txt = tLabel(props);
        if (!txt) return;
        const center = layer.getBounds().getCenter();
        L.marker(center, { icon: tLabelIcon(txt), pane: 'plssLabelsPane', interactive: false }).addTo(plssTownshipLabels);
      },
      style: () => ({ opacity: 0 })
    });
  })
  .catch(err => console.warn('PLSS townships overlay not loaded:', err));

// --- PLSS Sections (Local GeoJSON with simple labels) ---
const SECTIONS_MIN_ZOOM = 13;

// Create dedicated panes for sections and their labels to control drawing order
map.createPane('plssSectionsPane');
map.getPane('plssSectionsPane').style.zIndex = '355'; // Draw sections above townships
map.getPane('plssSectionsPane').style.pointerEvents = 'none';

let plssSectionsData = null; // This will hold our master GeoJSON data

/**
 * Calculates the bounding box of a GeoJSON feature's geometry.
 * This is much faster than creating a temporary Leaflet layer for each feature.
 * @param {object} geometry - A GeoJSON geometry object.
 * @returns {L.LatLngBounds} - The calculated bounds.
 */
function getFeatureBounds(geometry) {
    if (!geometry || !geometry.coordinates || geometry.coordinates.length === 0) {
        return null;
    }
    const bounds = L.latLngBounds([]);
    const coords = geometry.coordinates;

    // A recursive function to handle Polygons, MultiPolygons, etc.
    function processCoords(arr) {
        if (typeof arr[0] === 'number') { // It's a point [lng, lat]
            bounds.extend([arr[1], arr[0]]); // L.latLng expects [lat, lng]
        } else { // It's an array of points or an array of arrays
            arr.forEach(subArr => processCoords(subArr));
        }
    }

    processCoords(coords);
    return bounds;
}

function renderSectionsSubset() {
    // 2. Abort if data isn't loaded or we are too zoomed out
    if (!plssSectionsData || map.getZoom() < SECTIONS_MIN_ZOOM) {
        // Clear layers if we're too zoomed out
        plssSectionsOverlay.clearLayers();
        plssSectionLabelsOverlay.clearLayers();
        return;
    }

    // 3. Check if the overlay layers are active on the map
    const showLines = map.hasLayer(plssSectionsOverlay);
    const showLabels = map.hasLayer(plssSectionLabelsOverlay);
    
    if (!showLines && !showLabels) {
        return;
    }

    // 4. Filter features in view using the reliable bounding box method
    const mapBounds = map.getBounds();
    const featuresInView = (plssSectionsData.features || []).filter(feature => {
        const featureBounds = getFeatureBounds(feature.geometry);
        return featureBounds && mapBounds.intersects(featureBounds);
    }).slice(0, 1000); // Safety cap

    // Removed: console.log(`Rendering ${featuresInView.length} section features at zoom ${map.getZoom()}`);

    // 1. Clear previous layers AFTER we know we have data to show
    plssSectionsOverlay.clearLayers();
    plssSectionLabelsOverlay.clearLayers();

    if (featuresInView.length === 0) {
        return;
    }

    // 5A. Handle the Section Polygons (Lines)
    if (showLines) {
        try {
            const sectionPolygons = L.geoJSON(featuresInView, {
                style: {
                    color: '#999999',
                    weight: 1,
                    opacity: 0.9,
                    fillOpacity: 0
                },
                pane: 'plssSectionsPane',
                interactive: false
            });
            // Add the single, complete GeoJSON layer to its group.
            sectionPolygons.addTo(plssSectionsOverlay);
            // Removed: console.log('Section lines added successfully');
        } catch (error) {
            console.error('Error adding section lines:', error);
        }
    }

    // 5B. Handle the Section Labels (Numbers) - COMPLETELY SEPARATE
    if (showLabels) {
        try {
            featuresInView.forEach(feature => {
                const props = feature.properties || {};
                const sectionNumber = (props.FRSTDIVNO ?? props.SEC ?? '').toString();

                if (sectionNumber) {
                    // To get the center, we create a temporary, invisible layer for the feature.
                    // This is a standard and safe way to use Leaflet's geometry tools.
                    const tempLayer = L.geoJSON(feature);
                    const center = tempLayer.getBounds().getCenter();

                    // Create the label marker
                    const labelMarker = L.marker(center, {
                        icon: L.divIcon({
                            className: 'plss-section-label', // Use CSS for all styling
                            html: `<span>${sectionNumber}</span>`,
                            iconSize: null // Let CSS control the size
                        }),
                        interactive: false,
                        pane: 'plssLabelsPane' // Draw labels on their dedicated pane
                    });

                    // Add the individual marker to the labels layer group.
                    labelMarker.addTo(plssSectionLabelsOverlay);
                }
            });
            console.log('Section labels added successfully');
        } catch (error) {
            console.error('Error adding section labels:', error);
        }
    }
}

// Fetch the data ONCE and store it
fetch('data/plss_sections.geojson')
  .then(r => r.ok ? r.json() : Promise.reject(new Error('PLSS sections file not found')))
  .then(gj => {
    plssSectionsData = gj;
    // For debugging: check if data looks correct
    console.log("PLSS Sections data loaded:", plssSectionsData.features.length, "features found.");
    
    // Initial render after a short delay to ensure map is ready
    setTimeout(() => {
      renderSectionsSubset();
    }, 100);
  })
  .catch(err => console.warn('PLSS sections overlay not loaded:', err));

// Add event listeners with error handling
map.on('moveend', () => {
  try {
    renderSectionsSubset();
  } catch (error) {
    console.error('Error in moveend handler:', error);
  }
});

map.on('zoomend', () => {
  try {
    renderSectionsSubset();
  } catch (error) {
    console.error('Error in zoomend handler:', error);
  }
});

map.on('layeradd', (e) => {
  try {
    if (e.layer === plssSectionsOverlay || e.layer === plssSectionLabelsOverlay) {
      console.log('PLSS layer added:', e.layer === plssSectionsOverlay ? 'sections' : 'labels');
      renderSectionsSubset();
    }
  } catch (error) {
    console.error('Error in layeradd handler:', error);
  }
});

map.on('layerremove', (e) => {
  try {
    if (e.layer === plssSectionsOverlay || e.layer === plssSectionLabelsOverlay) {
      console.log('PLSS layer removed:', e.layer === plssSectionsOverlay ? 'sections' : 'labels');
      renderSectionsSubset();
    }
  } catch (error) {
    console.error('Error in layerremove handler:', error);
  }
});

// Ensure the outline does not block clicks on ponds
map.createPane('okBasePane');
map.getPane('okBasePane').style.zIndex = '250'; // below overlayPane (~400)
map.getPane('okBasePane').style.pointerEvents = 'none'; // NEVER intercept clicks

// Make the page background white so the map looks white behind the outline
// (useful when no tiles are shown)
document.body.style.background = '#ffffff';

// Oklahoma outline "blank" basemap
const oklahomaOutline = L.layerGroup();
fetch('data/oklahoma_boundary.geojson')
  .then(resp => resp.json())
  .then(geojson => {
    const outline = L.geoJSON(geojson, {
      pane: 'okBasePane',
      interactive: false,
      style: {
        color: '#666',
        weight: 2,
        opacity: 1,
        fillColor: '#ffffff',
        fillOpacity: 0.0
      }
    });
    outline.addTo(oklahomaOutline);
  })
  .catch(err => console.error('Failed to load Oklahoma boundary:', err));
 
// Set Oklahoma Outline as default basemap by adding it to the map initially
oklahomaOutline.addTo(map);

// Add the counties overlay to the map by default so it's checked on load
countiesOverlay.addTo(map);

const baseMaps = { "Oklahoma Outline": oklahomaOutline, "Streets": osm, "Hybrid": hybridMap };

// Layer Control: Use the actual overlay layers directly
const overlays = {
  "Counties": countiesOverlay,
  "County labels": countiesLabels,
  "PLSS Townships/Range": plssTownshipsOverlay,
  "PLSS Township labels": plssTownshipLabels,
  "PLSS Sections": plssSectionsOverlay,
  "PLSS Section labels": plssSectionLabelsOverlay
};

// --- DYNAMIC LAYER CONTROL FOR MOBILE ---
// 1. Create the layer control and store a reference to it.
//    Use L.Browser.mobile to make it collapsed by default ONLY on mobile.
const layersControl = L.control.layers(baseMaps, overlays, {
    collapsed: L.Browser.mobile
}).addTo(map);

// 2. Add event listeners to the map for popups.
map.on('popupopen', function() {
    // 3. If we are on a mobile device, collapse the control to make space.
    if (L.Browser.mobile) {
        layersControl.collapse();
    }
});

map.on('popupclose', function() {
    // 4. If we are on a mobile device, expand the control again when the popup is closed.
    if (L.Browser.mobile) {
        layersControl.expand();
    }
});

// --- 3. LOAD POND DATA AND DISPLAY ON MAP ---
// Create a layer group to hold all the pond layers so Leaflet re-renders crisply
const allPondsLayer = L.layerGroup().addTo(map);
let pondsLoaded = false; // ensure fetch happens once

async function loadPonds() {
  if (pondsLoaded) return;
  pondsLoaded = true;

  const indexResponse = await fetch('data/pond_index.json');
  const pondIds = await indexResponse.json();

  for (const pondId of pondIds) {
    try {
      const [attrResponse, geojsonResponse] = await Promise.all([
        fetch(`data/attributes/${pondId}.json`),
        fetch(`data/geojson/${pondId}.geojson`)
      ]);

      if (!attrResponse.ok) throw new Error(`Attributes file not found for PondID: ${pondId}`);
      if (!geojsonResponse.ok) throw new Error(`GeoJSON file not found for PondID: ${pondId}`);

      const attributes = await attrResponse.json();
      const geojsonData = await geojsonResponse.json();

      L.geoJSON(geojsonData, {
        pane: 'pondsPane',
        style: {
          color: '#0033ff',
          weight: 2,
          opacity: 1,
          fillColor: '#00aeff',
          fillOpacity: 0.6,
          fill: true
        },
        onEachFeature: function(feature, layer) {
          // --- 1. Create the Popup Content (Your existing code) ---
          let popupContent = `
            <div class="pond-popup">
              <div class="content-frame">
                <div>
                  <h4>${attributes.PondName}</h4>
                  <div class="attribute-row"><span class="label">Pond ID:</span><span class="value">${attributes.PondID}</span></div>
                  <div class="attribute-row"><span class="label">Survey Date:</span><span class="value">${attributes.SurveyDate}</span></div>
                  <div class="attribute-row"><span class="label">Max Depth:</span><span class="value">${attributes.MaxDepth_ft} ft</span></div>
                </div>
                <div class="scroll-area">
          `;

          if (attributes.DepthVolumeData && Array.isArray(attributes.DepthVolumeData)) {
            let tableHtml = `<h5>Stage-Volume Data</h5>
                             <table class="info-table">
                               <thead>
                                 <tr>
                                   <th>Decreasing Depths (ft)</th>
                                   <th>Volume (barrels)</th>
                                   <th>Surface Area (acres)</th>
                                 </tr>
                               </thead>
                               <tbody>`;

            attributes.DepthVolumeData.forEach(row => {
              const volumeInBarrels = Math.round(row.Volume);
              tableHtml += `<tr>
                              <td>${row.Depth.toFixed(1)}</td>
                              <td>${volumeInBarrels.toLocaleString()}</td>
                              <td>${row.SurfaceArea.toFixed(2)}</td>
                            </tr>`;
            });

            tableHtml += '</tbody></table>';
            popupContent += tableHtml;
          }

          popupContent += `</div></div></div>`;

          // --- 2. Bind the Popup (Your existing code) ---
          layer.bindPopup(popupContent);

          // --- 3. ADD THIS NEW MOBILE CENTERING LOGIC ---
          layer.on('click', function(e) {
            if (L.Browser.mobile) {
              // Wait for the popup to open and render
              setTimeout(() => {
                if (map._popup && map._popup.isOpen()) {
                  const popup = map._popup;
                  const popupLatLng = popup.getLatLng();
                  const mapContainer = map.getContainer();
                  const mapCenter = map.getCenter();
                  
                  // Get the popup's current screen position
                  const popupPoint = map.latLngToContainerPoint(popupLatLng);
                  const popupElement = popup._container;
                  
                  if (popupElement) {
                    const popupHeight = popupElement.offsetHeight;
                    const popupWidth = popupElement.offsetWidth;
                    const screenHeight = mapContainer.offsetHeight;
                    const screenWidth = mapContainer.offsetWidth;
                    
                    // Calculate how much to move the map so popup appears in center
                    
                    // Vertical centering
                    const currentPopupTop = popupPoint.y - popupHeight - 20; // 20px for tip
                    const targetPopupTop = (screenHeight - popupHeight) / 2;
                    const moveY = currentPopupTop - targetPopupTop;
                    
                    // Horizontal centering
                    const currentPopupLeft = popupPoint.x - (popupWidth / 2);
                    const targetPopupLeft = (screenWidth - popupWidth) / 2;
                    const moveX = currentPopupLeft - targetPopupLeft;
                    
                    // Convert the movement to map coordinates
                    const currentCenterPoint = map.latLngToContainerPoint(mapCenter);
                    const newCenterPoint = L.point(
                      currentCenterPoint.x + moveX, 
                      currentCenterPoint.y + moveY
                    );
                    const newCenter = map.containerPointToLatLng(newCenterPoint);
                    
                    // Pan to the new center
                    map.panTo(newCenter);
                  }
                }
              }, 100); // Even longer timeout to ensure everything is rendered
            }
          });
        }
      }).addTo(allPondsLayer);
    } catch (error) {
      console.error(`Failed to load data for pond ${pondId}:`, error);
    }
  }
}

// Initial call to load the data
loadPonds();