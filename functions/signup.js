const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
    // Gestion des CORS
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ success: false, error: 'Méthode non autorisée' })
        };
    }

    try {
        // Vérifier les variables d'environnement Supabase
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
            console.error('Variables d\'environnement Supabase manquantes');
            return {
                statusCode: 500,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    success: false, 
                    error: 'Configuration serveur manquante' 
                })
            };
        }

        // Initialiser le client Supabase
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_KEY
        );

        // Parser les données de la requête
        const { email, password, firstName, lastName, phone } = JSON.parse(event.body);

        // Validation des données
        if (!email || !password || !firstName || !lastName) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    success: false, 
                    error: 'Tous les champs obligatoires doivent être remplis' 
                })
            };
        }

        // Validation de l'email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    success: false, 
                    error: 'Format d\'email invalide' 
                })
            };
        }

        // Validation du mot de passe
        if (password.length < 8) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    success: false, 
                    error: 'Le mot de passe doit contenir au moins 8 caractères' 
                })
            };
        }

        console.log(`📝 Tentative d'inscription pour: ${email}`);

        // Créer l'utilisateur avec Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: email.trim().toLowerCase(),
            password: password,
            options: {
                data: {
                    first_name: firstName.trim(),
                    last_name: lastName.trim(),
                    phone: phone ? phone.trim() : null
                }
            }
        });

        if (authError) {
            console.error('Erreur lors de l\'inscription:', authError.message);
            
            let errorMessage = 'Erreur lors de l\'inscription';
            if (authError.message.includes('User already registered')) {
                errorMessage = 'Un compte existe déjà avec cet email';
            } else if (authError.message.includes('Password should be at least')) {
                errorMessage = 'Le mot de passe doit contenir au moins 6 caractères';
            } else if (authError.message.includes('Invalid email')) {
                errorMessage = 'Format d\'email invalide';
            }

            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    success: false, 
                    error: errorMessage 
                })
            };
        }

        // Si l'utilisateur a été créé avec succès
        if (authData.user) {
            console.log(`✅ Utilisateur créé avec succès: ${email}`);

            // Créer le profil utilisateur dans la table users
            const { data: profileData, error: profileError } = await supabase
                .from('users')
                .insert({
                    id: authData.user.id,
                    email: authData.user.email,
                    first_name: firstName.trim(),
                    last_name: lastName.trim(),
                    phone: phone ? phone.trim() : null,
                    date_of_birth: null, // Sera rempli plus tard
                    school: null, // Sera rempli plus tard
                    study_year: null, // Sera rempli plus tard
                    city: 'Bordeaux', // Valeur par défaut
                    is_admin: false,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .select()
                .single();

            if (profileError) {
                console.error('Erreur lors de la création du profil:', profileError);
                // L'utilisateur auth a été créé mais pas le profil
                // On peut continuer car le profil peut être créé plus tard
            }

            // Préparer la réponse
            const response = {
                success: true,
                user: {
                    id: authData.user.id,
                    email: authData.user.email,
                    first_name: firstName.trim(),
                    last_name: lastName.trim(),
                    phone: phone ? phone.trim() : null,
                    email_confirmed: authData.user.email_confirmed_at ? true : false,
                    created_at: authData.user.created_at
                },
                message: 'Compte créé avec succès'
            };

            // Si l'email n'est pas confirmé, ajouter un message
            if (!authData.user.email_confirmed_at) {
                response.message = 'Compte créé avec succès. Vérifiez votre email pour confirmer votre compte.';
            }

            // Si une session a été créée (connexion automatique)
            if (authData.session) {
                response.session = {
                    access_token: authData.session.access_token,
                    refresh_token: authData.session.refresh_token,
                    expires_at: authData.session.expires_at
                };
            }

            return {
                statusCode: 201,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(response)
            };
        } else {
            // Cas où l'utilisateur n'a pas été créé (peut arriver avec certains paramètres)
            return {
                statusCode: 500,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    success: false, 
                    error: 'Erreur lors de la création du compte' 
                })
            };
        }

    } catch (error) {
        console.error('Erreur serveur lors de l\'inscription:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                success: false, 
                error: 'Erreur serveur interne' 
            })
        };
    }
};
