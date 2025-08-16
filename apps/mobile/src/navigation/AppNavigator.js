import React, { useState, useEffect } from "react";
import { createStackNavigator } from "@react-navigation/stack";
import auth from "@react-native-firebase/auth";
import Login from "../components/Auth/Login";
import Detail from "../components/Auth/Detail";
import Dashboard from "../components/Dashboard/Dashboard";
import ChatScreen from "../components/chart/ChatScreen";

const Stack= createStackNavigator();
// import { createNativeStackNavigator } from '@react-navigation/native-stack';
// const Stack = createNativeStackNavigator();


const AppNavigator=()=>{
    const [initializing,setInitializing] = useState(true);
    const [user, setUser] = useState();

    const onAuthStateChange =(result)=>{
        setUser(result);
        if(initializing) setInitializing(false);
    };

    useEffect(()=>{
        const subscriber = auth().onAuthStateChanged(onAuthStateChange);
        return subscriber;
    },[]);
    if(initializing) return null;

    return (
        <Stack.Navigator initialRouteName={user?"Dashboard":"Login"}>
            <Stack.Screen
            name="Login"
            component={Login}
            options={{headerShown:false}}/>
            <Stack.Screen
            name="Detail"
            component={Detail}
            options={{headerShown:false}}/>
            <Stack.Screen
            name="Dashboard"
            component={Dashboard}
            options={{headerShown:false}}/>
            <Stack.Screen
            name="ChatScreen"
            component={ChatScreen}/>
        </Stack.Navigator>
    );
};

export default AppNavigator;