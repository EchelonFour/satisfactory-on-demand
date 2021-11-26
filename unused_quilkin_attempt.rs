use std::{future::Future, net::{IpAddr, SocketAddr}, sync::Arc};

use quilkin::{Config, Result, config::{Admin, Builder}, endpoint::Endpoint};
use slog::{Logger, info};
use tokio::join;

fn create_config(name: &'static str, forward_ip: IpAddr, game_port: u16, admin_port: u16) -> Arc<Config> {
    let mut config = Builder::empty()
        .with_port(game_port)
        .with_admin(Admin {
            address: SocketAddr::new("0.0.0.0".parse().unwrap(), admin_port)
        })
        .with_static(vec![], vec![Endpoint::new(SocketAddr::new(forward_ip, game_port).into())])
        .build();
    config.proxy.id = name.to_string();
    Arc::new(config)
}

fn create_listener(logger: Logger, name: &'static str, forward_ip: IpAddr, game_port: u16, admin_port: u16) -> impl Future<Output = Result<()>> {
    let config = create_config(name, forward_ip, game_port, admin_port);
    let new_logger = logger.new(slog::o!("port" => name));
    quilkin::run_with_config(config, vec![])
}
#[tokio::main]
async fn main() {

    let logger = quilkin::logger();
    let forward_ip: IpAddr = std::env::args().nth(1).expect("no forward ip given").parse().expect("could not parse forward ip");
    info!(logger, "forwarding to {}", forward_ip);
    let query_port_future = create_listener(logger.clone(), "query", forward_ip, 15777, 9001);
    let beacon_port_future = create_listener(logger.clone(), "beacon", forward_ip, 15000, 9002);
    let game_port_future = create_listener(logger.clone(), "game", forward_ip, 7777, 9003);
    
    let (query_port, beacon_port, game_port) = join!(query_port_future, beacon_port_future, game_port_future);
    query_port.unwrap();
    beacon_port.unwrap();
    game_port.unwrap();
}