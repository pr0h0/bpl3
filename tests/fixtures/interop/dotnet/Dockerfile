FROM mcr.microsoft.com/dotnet/sdk:10.0
ENV DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=true NUGET_PACKAGES=/opt/nuget
RUN apt-get update && apt-get install -y --no-install-recommends clang zlib1g-dev && rm -rf /var/lib/apt/lists/*
COPY Host/Host.csproj /opt/restore/Host/Host.csproj
COPY Provider/Provider.csproj /opt/restore/Provider/Provider.csproj
RUN dotnet restore /opt/restore/Host/Host.csproj && dotnet restore /opt/restore/Provider/Provider.csproj -r linux-x64 && chmod -R a+rX /opt/nuget && mkdir /opt/empty-feed
