const GOOGLE_PLACES_API = 'https://places.googleapis.com/v1';
const NURSERY_SEARCH_QUERY = 'Baba Ramapeer Nursery, Om Banna Mandir ke Samne, Barmer Road, Chohtan, Rajasthan, India';
const NURSERY_NAME_PATTERN = /baba.*ramap(?:eer|ir).*nursery|बाबा.*रामापीर.*नर्सरी/iu;
const NURSERY_ADDRESS_PATTERN = /chohtan|चौहटन/iu;

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Cache-Control': 'no-store, private',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff'
    },
    body: JSON.stringify(body)
  };
}

async function findNurseryPlaceId(apiKey) {
  const response = await fetch(`${GOOGLE_PLACES_API}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress'
    },
    body: JSON.stringify({
      textQuery: NURSERY_SEARCH_QUERY,
      languageCode: 'en',
      regionCode: 'IN',
      maxResultCount: 5
    })
  });

  if (!response.ok) {
    console.error('Google Places text search failed:', response.status);
    throw new Error('Google could not find the nursery listing.');
  }

  const result = await response.json();
  const place = (result.places || []).find(candidate => {
    const name = candidate.displayName?.text || '';
    const address = candidate.formattedAddress || '';
    return NURSERY_NAME_PATTERN.test(name) && NURSERY_ADDRESS_PATTERN.test(address);
  });

  if (!place?.id) {
    throw new Error('The nursery Google Maps listing could not be matched. Check the listing name and address.');
  }

  return place.id;
}

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return jsonResponse(503, { error: 'Google reviews are not configured. Add the Google Places API key in Netlify.' });
  }

  try {
    const placeId = process.env.GOOGLE_MAPS_PLACE_ID || await findNurseryPlaceId(apiKey);
    const response = await fetch(`${GOOGLE_PLACES_API}/places/${encodeURIComponent(placeId)}`, {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'displayName,rating,userRatingCount,reviews,googleMapsUri'
      }
    });

    if (!response.ok) {
      console.error('Google Places details request failed:', response.status);
      return jsonResponse(502, { error: 'Google could not load reviews for the nursery listing.' });
    }

    const place = await response.json();
    return jsonResponse(200, {
      name: place.displayName?.text || 'Baba Ramapeer Nursery',
      rating: place.rating ?? null,
      userRatingCount: place.userRatingCount ?? 0,
      reviews: place.reviews || [],
      googleMapsUri: place.googleMapsUri || null
    });
  } catch (error) {
    console.error('Unable to load Google Maps reviews:', error);
    return jsonResponse(502, { error: error.message || 'Unable to load Google Maps reviews.' });
  }
}
