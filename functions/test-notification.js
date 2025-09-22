/**
 * Script de test pour la fonction notify-admin-ticket-sale
 * Ce script simule un appel à la fonction pour tester l'intégration
 */

const { createClient } = require('@supabase/supabase-js');

// Configuration pour le test
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testNotification() {
    try {
        console.log('🧪 Test de la fonction notify-admin-ticket-sale');
        
        // Données de test (remplace par des vraies données de ton environnement)
        const testData = {
            associationId: "test-association-id", // Remplace par un vrai ID d'association
            eventId: "test-event-id", // Remplace par un vrai ID d'événement
            buyerId: "test-buyer-id", // Remplace par un vrai ID d'utilisateur
            eventName: "Test Event",
            buyerName: "Jean Dupont",
            buyerProfileURL: null
        };

        console.log('📝 Données de test:', testData);

        // Vérifier que l'association existe
        const { data: associationData, error: associationError } = await supabase
            .from('associations')
            .select('id, name')
            .eq('id', testData.associationId)
            .single();

        if (associationError) {
            console.log('⚠️ Association de test non trouvée, création d\'une association de test...');
            // Tu peux créer une association de test ici si nécessaire
        } else {
            console.log('✅ Association trouvée:', associationData.name);
        }

        // Vérifier les admins de l'association
        const { data: adminData, error: adminError } = await supabase
            .from('association_admins')
            .select('user_id')
            .eq('association_id', testData.associationId);

        if (adminError) {
            console.error('❌ Erreur lors de la récupération des admins:', adminError);
        } else if (!adminData || adminData.length === 0) {
            console.log('⚠️ Aucun admin trouvé pour cette association');
        } else {
            console.log('✅ Admins trouvés:', adminData.length);
            
            // Vérifier les device tokens
            const adminIds = adminData.map(admin => admin.user_id);
            const { data: usersData, error: usersError } = await supabase
                .from('users')
                .select('id, device_token, first_name, last_name')
                .in('id', adminIds)
                .not('device_token', 'is', null);

            if (usersError) {
                console.error('❌ Erreur lors de la récupération des utilisateurs:', usersError);
            } else if (!usersData || usersData.length === 0) {
                console.log('⚠️ Aucun device token trouvé pour les admins');
            } else {
                console.log('✅ Device tokens trouvés:', usersData.length);
                console.log('👥 Admins avec device tokens:', usersData.map(user => ({
                    name: `${user.first_name} ${user.last_name}`,
                    hasToken: !!user.device_token
                })));
            }
        }

        // Appel à la fonction de notification
        console.log('🔔 Appel de la fonction notify-admin-ticket-sale...');
        
        const response = await fetch(`${process.env.URL || 'https://bureaudesbureaux.com'}/.netlify/functions/notify-admin-ticket-sale`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.NOTIFICATION_SERVER_API_KEY}`
            },
            body: JSON.stringify(testData)
        });

        if (response.ok) {
            const result = await response.json();
            console.log('✅ Notification envoyée avec succès:', result);
        } else {
            const errorText = await response.text();
            console.error('❌ Erreur lors de l\'envoi de la notification:', errorText);
        }

    } catch (error) {
        console.error('❌ Erreur lors du test:', error);
    }
}

// Exporter la fonction pour pouvoir l'appeler
exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: 'Méthode non autorisée' })
        };
    }

    await testNotification();
    
    return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Test terminé' })
    };
};

// Si ce script est exécuté directement
if (require.main === module) {
    testNotification();
}
