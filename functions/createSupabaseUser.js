const { createClient } = require('@supabase/supabase-js');

// Initialisation du client Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

exports.handler = async (event) => {
    console.log('👤 Fonction createSupabaseUser appelée');

    // Vérifier la méthode HTTP
    if (event.httpMethod !== 'POST') {
        console.log('❌ Méthode HTTP non autorisée:', event.httpMethod);
        return {
            statusCode: 405,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: JSON.stringify({ error: 'Méthode non autorisée' })
        };
    }

    // Gestion des requêtes OPTIONS pour CORS
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: ''
        };
    }

    try {
        const { email, password, firstName, lastName, phone } = JSON.parse(event.body);

        if (!email || !password || !firstName || !lastName) {
            console.log('❌ Données manquantes');
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS'
                },
                body: JSON.stringify({ error: 'Email, mot de passe, prénom et nom requis' })
            };
        }

        console.log('📧 Création d\'un compte Supabase pour:', email);

        // Créer l'utilisateur dans Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true, // Auto-confirmer l'email
            user_metadata: {
                first_name: firstName,
                last_name: lastName,
                phone: phone || null
            }
        });

        if (authError) {
            console.error('❌ Erreur lors de la création de l\'utilisateur auth:', authError);
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS'
                },
                body: JSON.stringify({ 
                    error: 'Erreur lors de la création du compte',
                    details: authError.message 
                })
            };
        }

        console.log('✅ Utilisateur auth créé avec l\'ID:', authData.user.id);

        // Créer l'entrée dans la table users avec les informations complètes
        const { data: userData, error: userError } = await supabase
            .from('users')
            .insert({
                id: authData.user.id, // Utiliser l'ID de l'utilisateur auth
                first_name: firstName,
                last_name: lastName,
                email: email,
                date_of_birth: '2000-01-01', // Date par défaut (obligatoire)
                school: 'Bordeaux', // École par défaut (obligatoire)
                study_year: 'N/A', // Année par défaut (obligatoire)
                city: 'Bordeaux', // Ville par défaut (obligatoire)
                is_admin: false
            })
            .select()
            .single();

        if (userError) {
            console.error('❌ Erreur lors de la création de l\'utilisateur dans la table users:', userError);
            
            // Supprimer l'utilisateur auth créé en cas d'erreur
            await supabase.auth.admin.deleteUser(authData.user.id);
            
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS'
                },
                body: JSON.stringify({ 
                    error: 'Erreur lors de la création du profil utilisateur',
                    details: userError.message 
                })
            };
        }

        console.log('✅ Profil utilisateur créé avec succès');

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                userId: authData.user.id,
                message: 'Compte créé avec succès',
                user: {
                    id: userData.id,
                    email: userData.email,
                    first_name: userData.first_name,
                    last_name: userData.last_name
                }
            })
        };

    } catch (error) {
        console.error('❌ Erreur lors de la création de l\'utilisateur:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: JSON.stringify({
                error: 'Erreur interne du serveur',
                details: error.message
            })
        };
    }
};
