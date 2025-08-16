import React, { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, Dimensions, FlatList } from "react-native";
import firestore from "@react-native-firebase/firestore";
import auth from "@react-native-firebase/auth";
import { useNavigation, useIsFocused } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";

export default function Dashboard({ route }) {
    const [users, setUsers] = useState([]);
    const [userName, setUserName] = useState("");
    const navigation = useNavigation();
    const isFocused = useIsFocused();
    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const usersSnapshop = await firestore().collection("users").get();
                const usersData = usersSnapshop.docs.map((doc) => ({
                    id: doc.id,
                    ...doc.data(),
                }));
                setUsers(usersData);
            } catch (error) {
                alert("error fetching users");
                console.log("error fetching users");
            }
        };

        const fetchUserName = async () => {
            try {
                const currentUser = auth().currentUser;
                if (currentUser) {
                    const userDocument = await firestore()
                        .collection("users")
                        .doc(currentUser.uid)
                        .get();
                    setUserName(userDocument.data()?.name || "");
                }
            } catch (error) {
                alert("error fetching user's name");
                console.log("error fetching user's name");
            }
        };

        if (isFocused) {
            fetchUsers();
            fetchUserName();
        }
    }, [isFocused]);

    const navigateToChat = (userId, userName) => {
        navigation.navigate("ChatScreen", {
            userId,
            userName: userName
        });
    };

    const handleLogout = async () => {
        try {
            await auth().signOut();
            navigation.navigate("Login");
        } catch (error) {
            alert("error logging out");
            console.log("error logging out");
        }
    };

    return (
        <View
            style={{
                flex: 1,
                backgroundColor: "#000",
                position: "relative",
            }}
        >
            <View
                style={{
                    flex: 1,
                    backgroundColor: "#000",
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: "25%",
                    justifyContent: 'center'
                }}
            >
                <Text
                    style={{
                        fontSize: 32,
                        fontWeight: "bold",
                        margin: 10,
                        color: '#fff'
                    }}>
                    Home

                </Text>
                <View
                    style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                    <Text style={{ fontSize: 24, color: '#fff', margin: 10 }}>
                        Welcome, {userName}!
                    </Text>
                    <TouchableOpacity
                        onPress={handleLogout}>
                        <Text
                            style={{
                                fontSize: 24,
                                color: '#43A047',
                                margin: 10,
                                fontWeight: 'bold'
                            }}>
                            Logout
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
            <View
                style={{
                    flex: 1,
                    backgroundColor: "#ADD8E6",
                    position: "absolute",
                    top: "19%",
                    left: 0,
                    right: 0,
                    padding: 5,
                    borderTopRightRadius: 100,
                    bottom: 0
                }}>
                <FlatList
                    data={users}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            onPress={() => navigateToChat(item.id, item.name)}
                            style={{
                                marginBottom: 5,
                                borderRadius: 5,
                                overflow: 'hidden'
                            }}>
                            <LinearGradient
                                colors={["rgba(0,0,0,1)", "rgba(128,128,128,0)"]}
                                style={{
                                    padding: 15,
                                    borderRadius: 30
                                }}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }} >
                            <Text style={{ color: 'white', fontSize: 20, fontWeight: 'bold' }}>
                                {item.name}
                            </Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    )}
                />
            </View>
        </View>
    );
}