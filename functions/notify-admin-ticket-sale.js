const apn = require('apn');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Initialisation du client Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Nettoie la clé des caractères indésirables ajoutés par Netlify
 * @param {string} key - La clé à nettoyer
 * @returns {string} - La clé nettoyée
 */
function cleanKeyFromNetlify(key) {
  // Enlever les triples guillemets que Netlify ajoute
  let cleanedKey = key.replace(/"""/g, '');
  
  // Enlever les guillemets simples ou doubles entourant la clé
  cleanedKey = cleanedKey.replace(/^["']|["']$/g, '');
  
  // Supprimer tout caractère non imprimable ou non ASCII
  cleanedKey = cleanedKey.replace(/[^\x20-\x7E\n]/g, '');
  
  return cleanedKey;
}

/**
 * Formate une clé en format PEM standard
 * @param {string} key - La clé à formater
 * @returns {string} - La clé formatée
 */
function formatPEMKey(key) {
  // Nettoyer d'abord la clé
  key = cleanKeyFromNetlify(key);
  
  // Extraire le contenu (sans les marqueurs PEM)
  const pemContent = key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----/g, '').trim();
  
  // Supprimer tous les sauts de ligne existants
  const contentWithoutNewlines = pemContent.replace(/\n/g, '');
  
  // Reformater avec des lignes de 64 caractères
  let formattedContent = '';
  for (let i = 0; i < contentWithoutNewlines.length; i += 64) {
    formattedContent += contentWithoutNewlines.slice(i, i + 64) + '\n';
  }
  
  // Reconstruire la clé au format PEM
  return '-----BEGIN PRIVATE KEY-----\n' + formattedContent + '-----END PRIVATE KEY-----\n';
}

exports.handler = async (event, context) => {
  // Vérification de la méthode HTTP
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Méthode non autorisée' })
    };
  }
  
  // Vérification de sécurité
  const authHeader = event.headers['authorization'];
  const expectedAuth = `Bearer ${process.env.NOTIFICATION_SERVER_API_KEY}`;
  
  if (authHeader !== expectedAuth) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: 'Non autorisé' })
    };
  }

  try {
    const { 
      associationId, 
      eventId, 
      buyerId, 
      eventName, 
      buyerName, 
      buyerProfileURL 
    } = JSON.parse(event.body);

    console.log('🎫 Notification de vente de ticket:', {
      associationId,
      eventId,
      buyerId,
      eventName,
      buyerName
    });

    // Validation des paramètres requis
    if (!associationId || !eventId || !buyerId || !eventName || !buyerName) {
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: 'Paramètres manquants',
          required: ['associationId', 'eventId', 'buyerId', 'eventName', 'buyerName']
        })
      };
    }

    // 1. Récupérer les admins de l'association
    console.log('🔍 Recherche des admins pour l\'association:', associationId);
    const { data: adminData, error: adminError } = await supabase
      .from('association_admins')
      .select('user_id')
      .eq('association_id', associationId);

    if (adminError) {
      console.error('❌ Erreur lors de la récupération des admins:', adminError);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          error: 'Erreur lors de la récupération des admins',
          details: adminError.message 
        })
      };
    }

    if (!adminData || adminData.length === 0) {
      console.log('ℹ️ Aucun admin trouvé pour cette association');
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          summary: {
            total: 0,
            success: 0,
            failed: 0,
            message: 'Aucun admin trouvé pour cette association'
          }
        })
      };
    }

    const adminIds = adminData.map(admin => admin.user_id);
    console.log('👥 Admins trouvés:', adminIds);

    // 2. Récupérer les device tokens des admins
    console.log('📱 Récupération des device tokens des admins');
    const { data: usersData, error: usersError } = await supabase
      .from('users')
      .select('id, device_token, first_name, last_name')
      .in('id', adminIds)
      .not('device_token', 'is', null);

    if (usersError) {
      console.error('❌ Erreur lors de la récupération des utilisateurs:', usersError);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          error: 'Erreur lors de la récupération des utilisateurs',
          details: usersError.message 
        })
      };
    }

    if (!usersData || usersData.length === 0) {
      console.log('ℹ️ Aucun device token trouvé pour les admins');
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          summary: {
            total: 0,
            success: 0,
            failed: 0,
            message: 'Aucun device token trouvé pour les admins'
          }
        })
      };
    }

    const deviceTokens = usersData.map(user => user.device_token);
    console.log('📱 Device tokens récupérés:', deviceTokens.length);

    // 3. Configuration APN
    let cleanedKey;
    
    console.log("🔑 Utilisation de la clé APN_KEY standard");
    const apnKey = process.env.APN_KEY;
    
    // Nettoyage préalable de la clé
    const cleanedApnKey = cleanKeyFromNetlify(apnKey);
    console.log("🧹 Nettoyage de la clé - Avant/Après:", {
      avantLongueur: apnKey.length,
      apresLongueur: cleanedApnKey.length,
      tripleGuillemetsPresents: apnKey.includes('"""'),
      tripleGuillemetsRestants: cleanedApnKey.includes('"""')
    });
    
    // Transformer la clé pour qu'elle soit au format PEM
    if (cleanedApnKey.includes("-----BEGIN PRIVATE KEY-----")) {
      cleanedKey = formatPEMKey(cleanedApnKey);
    } else {
      console.log("🔧 Ajout des marqueurs PEM à la clé");
      const keyWithMarkers = `-----BEGIN PRIVATE KEY-----\n${cleanedApnKey}\n-----END PRIVATE KEY-----`;
      cleanedKey = formatPEMKey(keyWithMarkers);
    }
    
    // Sauvegarder la clé dans un fichier temporaire
    const tmpDir = os.tmpdir();
    const keyFilePath = path.join(tmpDir, 'apn-key.p8');
    fs.writeFileSync(keyFilePath, cleanedKey);
    console.log("📝 Clé sauvegardée dans un fichier temporaire:", keyFilePath);
    
    // Créer le fournisseur APN
    let apnProvider;
    try {
      apnProvider = new apn.Provider({
        token: {
          key: keyFilePath,
          keyId: process.env.APN_KEY_ID,
          teamId: process.env.APN_TEAM_ID,
        },
        production: process.env.NODE_ENV === 'production'
      });
      console.log("✅ Fournisseur APN créé avec succès");
    } catch (error) {
      console.error("❌ Erreur lors de la création du fournisseur APN:", error);
      throw error;
    }

    // 4. Créer et envoyer la notification
    const notification = new apn.Notification();
    notification.expiry = Math.floor(Date.now() / 1000) + 24 * 3600; // 24h
    notification.badge = 1;
    notification.sound = "default";
    notification.alert = {
      title: "🎫 Nouvelle vente !",
      body: `${buyerName} a acheté un ticket pour ${eventName}`
    };
    notification.payload = { 
      type: 'admin_ticket_sale',
      associationId: associationId,
      eventId: eventId,
      buyerId: buyerId,
      eventName: eventName,
      buyerName: buyerName,
      buyerProfileURL: buyerProfileURL
    };
    notification.topic = "com.babylone";

    console.log('🔔 Envoi des notifications aux admins:', {
      totalAdmins: deviceTokens.length,
      eventName,
      buyerName
    });
    
    // Envoyer la notification à tous les appareils en parallèle
    const results = await Promise.all(
      deviceTokens.map(token => apnProvider.send(notification, token))
    );

    // Nettoyer le fichier temporaire
    try {
      fs.unlinkSync(keyFilePath);
      console.log("🧹 Fichier de clé temporaire supprimé");
    } catch (cleanupError) {
      console.warn("⚠️ Impossible de supprimer le fichier temporaire:", cleanupError);
    }

    // Analyser les résultats
    const failedTokens = results.flatMap((result, index) => 
      result.failed.map(failure => ({
        token: deviceTokens[index],
        reason: failure.response?.reason || "Erreur inconnue"
      }))
    );

    if (failedTokens.length > 0) {
      console.error("❌ Certaines notifications ont échoué:", failedTokens);
    }

    const successCount = deviceTokens.length - failedTokens.length;
    console.log(`✅ ${successCount} notifications envoyées avec succès sur ${deviceTokens.length}`);
    
    return { 
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        summary: {
          total: deviceTokens.length,
          success: successCount,
          failed: failedTokens.length,
          failedDetails: failedTokens
        }
      })
    };
  } catch (error) {
    console.error("❌ Erreur:", error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: "Erreur serveur", 
        details: error.message 
      })
    };
  }
};
