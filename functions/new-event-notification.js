const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  // Vérification de la méthode HTTP
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Méthode non autorisée' })
    };
  }

  // Vérification de sécurité avec une clé API
  const authHeader = event.headers['x-api-key'] || event.headers['X-Api-Key'];
  if (authHeader !== process.env.WEBHOOK_SECRET) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: 'Non autorisé' })
    };
  }

  try {
    // Récupérer les données de l'événement du corps de la requête
    const data = JSON.parse(event.body);
    const { event_id, name, date, location, price, association_id, image_url } = data;

    if (!event_id || !association_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Données d\'événement incomplètes' })
      };
    }

    console.log(`📩 Notification pour nouvel événement: ${name}`);

    // Initialiser le client Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // 1. Récupérer les membres de l'association
    const { data: memberships, error: membershipError } = await supabase
      .from('memberships')
      .select('user_id')
      .eq('association_id', association_id);

    if (membershipError) {
      console.error('Erreur lors de la récupération des abonnements:', membershipError);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Erreur lors de la récupération des abonnements' })
      };
    }

    if (!memberships || memberships.length === 0) {
      console.log('Aucun abonné pour cette association');
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Aucun abonné pour cette association' })
      };
    }

    const userIds = memberships.map(m => m.user_id);
    console.log(`👥 ${userIds.length} utilisateurs abonnés à cette association`);

    // 2. Récupérer les tokens des appareils de ces utilisateurs
    const { data: deviceTokens, error: tokenError } = await supabase
      .from('device_tokens')
      .select('token')
      .in('user_id', userIds);

    if (tokenError) {
      console.error('Erreur lors de la récupération des tokens:', tokenError);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Erreur lors de la récupération des tokens' })
      };
    }

    if (!deviceTokens || deviceTokens.length === 0) {
      console.log('Aucun token d\'appareil trouvé pour ces utilisateurs');
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Aucun token d\'appareil trouvé' })
      };
    }

    const tokens = deviceTokens.map(dt => dt.token);
    console.log(`📱 ${tokens.length} tokens d'appareils trouvés`);

    // 3. Envoyer les notifications via notre propre fonction Netlify
    const response = await fetch('/.netlify/functions/send-notification', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.NOTIFICATION_SERVER_API_KEY}`
      },
      body: JSON.stringify({
        deviceTokens: tokens,
        eventData: {
          id: event_id,
          title: name,
          date: date,
          location: location,
          price: price,
          image_url: image_url
        }
      })
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Erreur lors de l\'envoi des notifications:', result);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Erreur lors de l\'envoi des notifications', details: result })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Notifications envoyées avec succès', 
        details: result 
      })
    };
    
  } catch (error) {
    console.error('Erreur :', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Erreur serveur', error: error.message })
    };
  }
}; 