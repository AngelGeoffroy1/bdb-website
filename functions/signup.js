const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
    // Configuration CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };

    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        // Initialiser Supabase
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
            console.error('❌ Variables d\'environnement Supabase manquantes');
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Configuration serveur manquante' })
            };
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Parser les données
        const { 
            email, 
            password, 
            firstName, 
            lastName, 
            phone, 
            dateOfBirth, 
            school, 
            studyYear, 
            city 
        } = JSON.parse(event.body);

        // Validation des données
        if (!email || !password || !firstName || !lastName || !dateOfBirth || !school || !studyYear || !city) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    error: 'Tous les champs sont obligatoires' 
                })
            };
        }

        // Validation email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    error: 'Format d\'email invalide' 
                })
            };
        }

        // Validation mot de passe
        if (password.length < 8) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    error: 'Le mot de passe doit contenir au moins 8 caractères' 
                })
            };
        }

        console.log('🔐 Tentative d\'inscription pour:', email);

        // Créer l'utilisateur dans Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: email,
            password: password,
        });

        if (authError) {
            console.error('❌ Erreur auth Supabase:', authError.message);
            
            let errorMessage = 'Erreur lors de la création du compte';
            if (authError.message.includes('already registered')) {
                errorMessage = 'Un compte existe déjà avec cet email';
            } else if (authError.message.includes('Invalid email')) {
                errorMessage = 'Email invalide';
            } else if (authError.message.includes('Password should be at least')) {
                errorMessage = 'Le mot de passe doit contenir au moins 6 caractères';
            }

            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: errorMessage })
            };
        }

        if (!authData.user) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Échec de la création du compte' })
            };
        }

        console.log('✅ Utilisateur auth créé:', authData.user.id);

        // Créer le profil utilisateur dans la table users
        const { error: profileError } = await supabase
            .from('users')
            .insert({
                id: authData.user.id,
                email: email,
                first_name: firstName,
                last_name: lastName,
                phone: phone || null,
                date_of_birth: dateOfBirth,
                school: school,
                study_year: studyYear,
                city: city,
                is_admin: false
            });

        if (profileError) {
            console.error('❌ Erreur création profil:', profileError);
            
            // Rollback: supprimer l'utilisateur auth si le profil échoue
            await supabase.auth.admin.deleteUser(authData.user.id);
            
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    error: 'Erreur lors de la création du profil utilisateur' 
                })
            };
        }

        console.log('✅ Profil utilisateur créé avec succès');

        // Générer un token JWT pour la session
        const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
            type: 'magiclink',
            email: email,
        });

        // Retourner les données utilisateur (sans le mot de passe)
        const userData = {
            id: authData.user.id,
            email: email,
            first_name: firstName,
            last_name: lastName,
            phone: phone,
            date_of_birth: dateOfBirth,
            school: school,
            study_year: studyYear,
            city: city,
            created_at: authData.user.created_at
        };

        return {
            statusCode: 201,
            headers,
            body: JSON.stringify({
                message: 'Compte créé avec succès',
                user: userData,
                token: authData.session?.access_token || null
            })
        };

    } catch (error) {
        console.error('❌ Erreur serveur signup:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'Erreur interne du serveur' 
            })
        };
    }
};
