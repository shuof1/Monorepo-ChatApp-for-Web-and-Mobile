import React, { useState } from 'react'
import auth from "@react-native-firebase/auth"
import firestore from '@react-native-firebase/firestore'
import { useNavigation } from "@react-navigation/native"
import {
    View, Text, Image, TextInput, TouchableOpacity
    , KeyboardAvoidingView, Platform, ScrollView, SafeAreaView
} from 'react-native';

export default function Login() {
    const [phoneNumber, setPhoneNumber] = useState("");
    const [code, setCode] = useState("");
    const [confirm, setConfirm] = useState(null);
    const navigation = useNavigation();

    const signInWithPhoneNumber = async () => {
        try {
            //validate phone number
            // const phoneRegex = /^\+\d{1,4} \d{1,15}$/;
            const phoneRegex = /$/;
            if (!phoneRegex.test(phoneNumber)) {
                alert("invaild phone number");
                return;
            }
            const confirmation = await auth().signInWithPhoneNumber(phoneNumber);
            setConfirm(confirmation);
        } catch (e) {
            alert(`error sending code: ${e?.code}`);
            console.log("error sending code", e?.code, e?.message);
        }
    };

    const confirmCode = async () => {
        try {
            if (!code || code.length !== 6) {
                alert("invaild code");
                return;
            }
            const userCredential = await confirm.confirm(code);
            const user = userCredential.user;
            const userDocument = await firestore()
                .collection("users")
                .doc(user.uid)
                .get({ source: 'server' });

            const data = userDocument.data();
            const hasProfile = userDocument.exists && typeof data?.name === 'string' && data.name.length > 0;
            if (hasProfile) {
                console.log('exists', user.uid + "  ," + JSON.stringify(user, null, 2));
                navigation.navigate("Dashboard");
            } else {
                navigation.navigate("Detail", { uid: user.uid });
            }
        } catch (error) {
            alert("error code" + error);
            console.log("error code " + error);
        }
    };

    return (
        <View
            style={{
                flex: 1,
                backgroundColor: "#000",
                position: "relative",
            }}>
            <View
                style={{
                    flex: 1,
                    backgroundColor: "#000",
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: "25%"
                }}
            />
            <View
                style={{
                    flex: 1,
                    backgroundColor: "#ADD8E6",
                    padding: 20,
                    borderTopEndRadius: 100,
                    position: "absolute",
                    top: "25%",
                    left: 0,
                    right: 0,
                    bottom: 0
                }}
            >
                <Text
                    style={{
                        fontSize: 32,
                        fontWeight: "bold",
                        marginBottom: 40,
                        marginTop: 20,
                        textAlign: "center"
                    }}
                >
                    Bug Chat App
                </Text>
                <View
                    style={{
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 30
                    }}>
                    <Image
                        source={require('../../../assets/icon.png')}
                        style={{ width: 150, height: 150, borderRadius: 50 }}
                    ></Image>
                </View>

                {!confirm ? (
                    <>
                        <Text
                            style={{
                                fontSize: 18,
                                color: '#808080',
                                marginBottom: 20,
                                marginTop: 20,
                            }}
                        >
                            Enter Your phone number
                        </Text>
                        <TextInput
                            style={{
                                height: 48,
                                width: '100%',
                                borderColor: '#000',
                                borderWidth: 1,
                                marginBottom: 16,
                                paddingHorizontal: 12,
                                borderRadius: 10,
                                backgroundColor: '#fff',   // 让文字对比更明显
                            }}
                            placeholder='e.g. +1 111-111-1111'
                            value={phoneNumber}
                            onChangeText={setPhoneNumber}
                            keyboardType='phone-pad'
                        />
                        <TouchableOpacity
                            onPress={signInWithPhoneNumber}
                            style={{
                                backgroundColor: '#007BFF',
                                padding: 10,
                                borderRadius: 20,
                                alignItems: 'center'
                            }}>
                            <Text
                                style={{ color: 'white', fontSize: 22, fontWeight: 'bold' }}>
                                Verfit phone number
                            </Text>
                        </TouchableOpacity>
                    </>

                ) : (
                    <>
                        <Text
                            style={{
                                marginBottom: 20,
                                fontSize: 18,
                                color: '#808080'
                            }}>
                            Enrer code
                        </Text>
                        <TextInput
                            style={{
                                height: 50,
                                width: "100%",
                                borderColor: "black",
                                borderWidth: 1,
                                marginBottom: 30,
                                paddingHorizontal: 10,
                                borderRadius: 10,
                            }}
                            placeholder='enter code'
                            value={code}
                            onChangeText={setCode}
                            keyboardType='phone-pad'
                        />
                        <TouchableOpacity
                            onPress={confirmCode}
                            style={{
                                backgroundColor: '#007BFF',
                                padding: 10,
                                borderRadius: 20,
                                alignItems: 'center'
                            }}>
                            <Text
                                style={{ color: 'white', fontSize: 22, fontWeight: 'bold' }}>
                                Confirm Code
                            </Text>
                        </TouchableOpacity>

                    </>
                )}
            </View>
        </View>
    );
}

