import { Poru, ResolveOptions } from "./Poru";
import { Node } from "./Node";
import { Track, trackData } from "./guild/Track";
import { Connection } from "./Connection";
import Queue from "./guild/Queue";
import { EventEmitter } from "events";
import { Filters } from "./Filters";
import { Response } from "./guild/Response";
import { ConnectionOptions } from "./Poru";
type Loop = "NONE" | "TRACK" | "QUEUE";

export class Player extends EventEmitter {
  public poru: Poru;
  public node: Node;
  public connection: Connection;
  public queue: Queue;
  public filters :Filters;
  public guildId: string;
  public voiceChannel: string;
  public textChannel: string;
  public currentTrack: Track;
  public previousTrack: Track;
  public isPlaying: boolean
  public isPaused: boolean;
  public isConnected: boolean;
  public loop: Loop;
  public position: number;
  public ping: number;
  
  public timestamp: number;
  
  
  public mute: boolean;
  public deaf: boolean;
  public volume: number;
  
  constructor(poru: Poru, node: 
    Node, options) {
    super();
    this.poru = poru;
    this.node = node;
    this.queue = new Queue();
    this.connection = new Connection(this);
    this.guildId = options.guildId;
    this.filters = new Filters(this);
    this.voiceChannel = options.voiceChannel;
    this.textChannel = options.textChannel;
    this.currentTrack = null;
    this.previousTrack = null;
    this.deaf = options.deaf || false;
    this.mute = options.mute || false;
    this.volume = 100;
    this.isPlaying = false;
    this.isPaused = false;
    this.position = 0;
    this.ping = 0;
    this.timestamp = null;
    this.isConnected = false;
    this.loop = "NONE";
 
    this.on("playerUpdate", (packet) => {
      (this.isConnected = packet.state.connected),
        (this.position = packet.state.position),
        (this.ping = packet.state.ping);
      this.timestamp = packet.state.time;
    });
    this.on("event", (data) => this.eventHandler(data));
  }



  public async play() {
    if (!this.queue.length) return;
    this.currentTrack = this.queue.shift();
    if (!this.currentTrack.track)
      this.currentTrack = await this.currentTrack.resolve(this.poru);
    this.isPlaying = true;
    this.position = 0;

    this.node.rest.updatePlayer({
      guildId: this.guildId,
      data: {
        encodedTrack: this.currentTrack.track,
      },
    });
  }

  public connect(options: ConnectionOptions  = this) {
    let { guildId, voiceChannel, deaf, mute } = options;
    this.send({
      guild_id: guildId,
      channel_id: voiceChannel,
      self_deaf: deaf || true,
      self_mute: mute || false,
    });

    this.isConnected = true;
    this.poru.emit(
      "debug",
      this.guildId,
      `[Poru Player] Player has been connected`
    );
  }

  public stop() {
    this.position = 0;
    this.isPlaying = false;
    this.node.rest.updatePlayer({
      guildId: this.guildId,
      data: { encodedTrack: null },
    });

    return this;
  }

  public pause(toggle:boolean = true) {
   
    this.node.rest.updatePlayer({guildId: this.guildId,data: {paused: toggle}});
    this.isPlaying = !toggle;
    this.isPaused = toggle;

    return this;
  }

  public seekTo(position:number):void {

    if(this.position + position >= this.currentTrack.info.length) position = this.currentTrack.info.length;
    this.node.rest.updatePlayer({guildId: this.guildId,data: {position}});
  }


 public setVolume(volume :number) {
   
    if(volume < 0 || volume > 1000) throw new Error("[Poru Exception] Volume must be between 0 to 1000")
    this.node.rest.updatePlayer({guildId: this.guildId,data: {volume}});
 
      return this; 
    }


    public setLoop(mode:Loop) {
      if (!mode) throw new Error(`[Poru Player] You must have to provide loop mode as argument of setLoop`);
  
      if (!["NONE", "TRACK", "QUEUE"].includes(mode)) throw new Error(`[Poru Player] setLoop arguments are NONE,TRACK AND QUEUE`);
  
      switch (mode) {
        case "NONE": {
          this.loop = "NONE";
          break;
        }
        case "TRACK": {
          this.loop = "TRACK";
          break;
        }
        case "QUEUE": {
          this.loop = "QUEUE";
          break;
        }
        default :
        {
          this.loop = "NONE";
        }
      }
  
      return this;
    }
  

    public setTextChannel(channel:string) {
      this.textChannel = channel;
      return this;
    }
  
    public setVoiceChannel(channel:string) {
      this.voiceChannel = channel;
      return this;
    }

    public disconnect() {
      if (!this.voiceChannel) return;
      this.pause(true);
      this.isConnected = false;
      this.send({
        guild_id: this.guildId,
        channel_id: null,
        self_mute: false,
        self_deaf: false,
      });
      this.voiceChannel = null;
      return this;
    }
  

   public destroy() {
      this.disconnect();
      this.node.rest.destroyPlayer(this.guildId)
      this.poru.emit("playerDisconnect", this);
      this.poru.emit("debug",this.guildId,`[Poru Player] destroyed the player`);
  
      this.poru.players.delete(this.guildId);
    }








  public restart() {}
   public move() {}

  public eventHandler(data) {
    switch (data.type) {
      case "TrackStartEvent": {
        this.isPlaying = true;
        this.poru.emit("playerStart", this, this.currentTrack);
        break;
      }
      case "TrackEndEvent": {
        this.previousTrack = this.currentTrack;
        if (this.loop === "TRACK") {
          this.queue.unshift(this.previousTrack);
          this.poru.emit("playerEnd", this, this.currentTrack);
          return this.play();
        } else if (this.currentTrack && this.loop === "QUEUE") {
          this.queue.push(this.previousTrack);
          this.poru.emit("playerEnd", this, this.currentTrack, data);
          return this.play();
        }

        if (this.queue.length === 0) {
          this.isPlaying = false;
          return this.poru.emit("playerDisconnect", this);
        } else if (this.queue.length > 0) {
          this.poru.emit("playerEnd", this, this.currentTrack);
          return this.play();
        }

        this.isPlaying = false;
        this.poru.emit("playerDisconnect", this);
        break;
      }

      case "TrackStuckEvent": {
        this.poru.emit("playerError", this, this.currentTrack, data);
        this.stop();
        break;
      }
      case "TrackExceptionEvent": {
        this.poru.emit("playerError", this, this.currentTrack, data);
        this.stop();
        break;
      }
      case "WebSocketClosedEvent": {
        if ([4015, 4009].includes(data.code)) {
          this.send({
            guild_id: data.guildId,
            channel_id: this.voiceChannel,
            self_mute: this.mute,
            self_deaf: this.deaf,
          });
        }
        this.poru.emit("playerClose", this, this.currentTrack, data);

        break;
      }
      default:
        {
        throw new Error(`An unknown event: ${data}`);
      }
    }
  }


 async resolve({ query, source,  requester }: ResolveOptions) {
    const regex = /^https?:\/\//;

    if (regex.test(query)) {
      let response = await this.node.rest.get(
        `/v3/loadtracks?identifier=${encodeURIComponent(query)}`
      );
      return new Response(response, requester);
    } else {
      let track = `${source || "ytsearch"}:${query}`;
      let response = await this.node.rest.get(
        `/v3/loadtracks?identifier=${encodeURIComponent(track)}`
      );
      return new Response(response,requester);
    }
  }

  public send(data) {
    this.poru.send({ op: 4, d: data });
  }
}